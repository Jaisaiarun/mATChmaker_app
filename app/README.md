# mATChmaker — Web App

This is the web application for **mATChmaker**, a platform for NRPS adenylation-domain
substrate prediction and Thioesterase Terminal Extension (TTE) analysis, built on top of
the [PARAS/PARASECT](https://github.com/BTheDragonMaster/parasect) prediction engine.

## Prerequisites

Before running the app, make sure the following are in place:

- The PARAS and PARASECT model files, placed in `app/models/`.
  Download them from [Zenodo](https://zenodo.org/records/13165500).
- The antiSMASH and MIBiG-derived databases (see [Docker: first-run setup](#first-run-setup) below,
  or set these up manually if running outside Docker).

## Run with Docker (recommended)

The app ships as two services — `matchmaker-server` (API) and `matchmaker-client` (React + nginx).

Create a `.env` file in `app/` with:

`REACT_APP_TURNSTILE_SITE_KEY=<your_turnstile_site_key>`

Build and start everything:

```bash
docker compose -p matchmaker up --build --force-recreate --remove-orphans -d
```

The app will be available at `http://localhost:4010/`.

### First-run setup

The first time you start the server, run this to download the antiSMASH databases
(only needed once — they persist in the `antismash_databases` volume):

```bash
docker exec matchmaker-server conda run -n web \
  download-antismash-databases --database-dir /app/antismash_databases
```

### Useful commands

Build and start the development server (with the dev override file):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml -p matchmaker up --build
```

Stop the containers:

```bash
docker compose -p matchmaker down
```

## Run locally for development (without Docker)

### Server

```bash
conda env create -n web -f server-environment.yml
conda activate web
pip install -r server-requirements.txt
```

You'll also need on your machine:

* hmmer2
* muscle (v3.8.1551)

Start the server:

```bash
bash src/server/start.sh
```

### Client

```bash
cd src/client
npm install
npm start
```

Visit `http://localhost:3000/` in your browser.

## Deployment notes

Copying files to the deployment server:

```bash
scp -r ./my_folder <your-server-alias>:~/mATChmaker_app/app/
```

## Stack notes

- Server: FastAPI/Flask served via `gunicorn` (production) — `uvicorn` is used for local dev/reload.
- Client: React, built and served via nginx in production.