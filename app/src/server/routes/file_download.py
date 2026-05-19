import io
import os
import zipfile
from flask import Blueprint, Response, request
from flask import send_file

from .app import app
from .common import ResponseData, Status

blueprint_file_download = Blueprint("file_download", __name__)


@blueprint_file_download.route("/api/download_zip/<job_id>", methods=["GET"])
def download_zip(job_id: str):
    job = app.config.get("JOB_RESULTS", {}).get(job_id)
    if not job:
        return ResponseData(Status.Failure, message="Job not found.").to_dict(), 404

    gb_file_paths: dict = job.get("gb_file_paths", {})
    requested = request.args.getlist("files[]")

    if not requested:
        return ResponseData(Status.Failure, message="No files requested.").to_dict(), 400

    zip_buffer = io.BytesIO()
    missing = []

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for filename in requested:
            path = gb_file_paths.get(filename)

            # Fallback: fuzzy match
            if not path:
                for stored_name, stored_path in gb_file_paths.items():
                    if stored_name.endswith(filename) or filename in stored_name:
                        path = stored_path
                        break

            if path and os.path.isfile(path):
                zf.write(path, filename)
            else:
                missing.append(filename)

    if missing:
        app.logger.warning("download_zip: files not found on disk: %s", missing)

    zip_buffer.seek(0)
    return Response(
        zip_buffer.getvalue(),
        mimetype="application/zip",
        headers={"Content-Disposition": 'attachment; filename="selected_gb_files.zip"'},
    )


@blueprint_file_download.route("/api/download_file/<job_id>/<filename>", methods=["GET"])
def download_file(job_id: str, filename: str):
    job = app.config.get("JOB_RESULTS", {}).get(job_id)
    if not job:
        return ResponseData(Status.Failure, message="Job not found.").to_dict(), 404

    gb_file_paths: dict = job.get("gb_file_paths", {})
    path = gb_file_paths.get(filename)

    # Fallback: the dict may be keyed by "stem::region_id" rather than by filename,
    # so scan all stored paths and match by basename.
    if not path:
        for stored_path in gb_file_paths.values():
            if os.path.basename(stored_path) == filename:
                path = stored_path
                break

    if not path or not os.path.isfile(path):
        return ResponseData(Status.Failure, message="File not found.").to_dict(), 404

    return send_file(path, as_attachment=True, download_name=filename)


@blueprint_file_download.route("/api/download_reference_gbk/<path:filename>", methods=["GET"])
def download_reference_gbk(filename: str):
    """
    Serve a GenBank file from the TTE reference database directory.

    Filenames come from the TTE search results' `filename` field. We
    resolve against MIBIG_NRPS_DIR and verify the canonical path is still
    inside that directory (defence against `..` traversal etc.), then
    confirm the file is .gb/.gbk before sending.
    """
    from .build_tte_db import MIBIG_NRPS_DIR  # imported lazily to avoid import cycles at module load

    base = os.path.realpath(MIBIG_NRPS_DIR)
    candidate = os.path.realpath(os.path.join(base, filename))

    if not candidate.startswith(base + os.sep) and candidate != base:
        return ResponseData(Status.Failure, message="Invalid path.").to_dict(), 400

    if not os.path.isfile(candidate):
        return ResponseData(Status.Failure, message="File not found.").to_dict(), 404

    lower = candidate.lower()
    if not (lower.endswith(".gb") or lower.endswith(".gbk")):
        return ResponseData(Status.Failure, message="Not a GenBank file.").to_dict(), 400

    return send_file(candidate, as_attachment=True, download_name=os.path.basename(candidate))