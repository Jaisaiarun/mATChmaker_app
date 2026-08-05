# Webapp

First make sure all three PARAS and PARASECT models are present in the `app/models` folder.
You can download the models from [Zenodo](https://zenodo.org/records/13165500).

## Run locally for development

### Server

Create a local environment with conda and install server side dependencies with pip from `src/server/requirements.txt`:

```bash
conda create -n paras python=3.9
conda activate paras
pip install -r src/server/requirements.txt
```

Install the following dependencies on your machine:

* hmmer2
* muscle (v.3.8.1551)

### Client

First install NPM package manager and Node.js on your device.

Then install client side dependencies with NPM from `src/client/package.json`:

```bash
cd src/client
npm install
```

### Run

Run the server in one terminal:

```bash
bash run_server.sh
```

Run the client in another terminal:

```bash 
cd src/client
npm start
```

Visit `https://localhost:3000/` in your browser to view the app.

## Run with Docker

Run the following script to build and runt he app in a Docker container:

```bash
docker-compose -p paras up --build --force-recreate --remove-orphans -d
```

The app will be available at `https://localhost:4010/`.

### Commands

Build the development server image

```
docker compose -f docker-compose.yml -f docker-compose.dev.yml -p paras up --build
````

Stop the development server container

```
docker compose -p paras down
```

Run this once after deploying to download the antiSMASH databases (takes a while)

```
docker exec paras-server conda run -n web \
  download-antismash-databases --database-dir /app/antismash_databases
```

Copy files through scp mpi server.

```
scp -r .\my_folder mpi:~/mATChmaker_app/app/
```


## Learning topics:

- uvicorn - better for development
- gunicorn - better for production

## To Do :

- add filters for table , for sorting and filtering
- get access to to database and also to raven cluster
- better monomer pairings
- paras annotations as a seperate asdomain in genebank file 