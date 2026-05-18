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
