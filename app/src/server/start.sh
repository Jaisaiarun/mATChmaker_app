#!/bin/bash
set -e

source /opt/conda/etc/profile.d/conda.sh
conda activate web

if [ ! -f /app/antismash_databases/.complete ]; then
    echo "=== antiSMASH databases not found — downloading (first run only) ==="
    download-antismash-databases --database-dir /app/antismash_databases
    touch /app/antismash_databases/.complete
    chown -R 1000:1000 /app/antismash_databases
    echo "=== Database download complete ==="
else
    echo "=== antiSMASH databases already present, skipping download ==="
fi

exec su -s /bin/bash app -c \
    "source /opt/conda/etc/profile.d/conda.sh && conda activate web && \
     gunicorn -b :4009 --worker-class gthread \
     --workers 1 --threads 4 --preload --timeout 120 api:app"