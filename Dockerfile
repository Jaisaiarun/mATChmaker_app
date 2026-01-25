# ---- Base OS ----
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# ---- System dependencies ----
RUN apt-get update && apt-get install -y \
    build-essential \
    wget \
    curl \
    git \
    ca-certificates \
    perl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# ---- Install Node.js + npm (LTS) ----
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get update && apt-get install -y nodejs && \
    npm --version && node --version

# ---- Install MUSCLE 3.8.1551 ----
RUN wget https://www.drive5.com/muscle/downloads3.8.1551/muscle3.8.1551_src.tar.gz && \
    tar -xzf muscle3.8.1551_src.tar.gz && \
    cd muscle3.8.1551/src && \
    make && \
    cp muscle /usr/local/bin/ && \
    cd / && rm -rf muscle3.8.1551*

# ---- Install HMMER 2.x (legacy) ----
RUN wget http://eddylab.org/software/hmmer/hmmer-2.3.2.tar.gz && \
    tar -xzf hmmer-2.3.2.tar.gz && \
    cd hmmer-2.3.2 && \
    ./configure && \
    make && \
    make install && \
    cd / && rm -rf hmmer-2.3.2*

# ---- Clone Parasect repo ----
RUN git clone https://github.com/BTheDragonMaster/parasect.git

# ---- Install Node dependencies ----
WORKDIR /app/parasect/app
RUN npm install

# ---- Expose web port (adjust if needed) ----
EXPOSE 3000

# ---- Start the app ----
CMD ["npm", "start"]
