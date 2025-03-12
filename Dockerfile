# Use a specific Node.js version for better reproducibility
FROM node:23.3.0-slim AS builder

# Install pnpm globally and necessary build tools
RUN npm install -g pnpm@9.15.4 && \
    apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y \
    git \
    python3 \
    python3-pip \
    curl \
    node-gyp \
    ffmpeg \
    libtool-bin \
    autoconf \
    automake \
    libopus-dev \
    make \
    g++ \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    openssl \
    libssl-dev libsecret-1-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Python 3 as the default python
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Set the working directory
WORKDIR /app

# Copy application code
COPY . .

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Build the project
RUN pnpm run build && pnpm prune --prod

# Final runtime image
FROM node:23.3.0-slim

# Install runtime dependencies
RUN npm install -g pnpm@9.15.4 && \
    apt-get update && \
    apt-get install -y \
    git \
    python3 \
    ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy built artifacts and production dependencies from the builder stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/.npmrc ./
COPY --from=builder /app/turbo.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/agent ./agent
COPY --from=builder /app/client ./client
COPY --from=builder /app/lerna.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/characters ./characters

# Add build argument for required API key
ARG REDPILL_API_KEY

# Set environment variables
ENV SERVER_PORT=3000 \
    CACHE_STORE=database \
    DEFAULT_LOG_LEVEL=info \
    LOG_JSON_FORMAT=false \
    TEE_MODE=OFF \
    BITMIND=true \
    TWITTER_DRY_RUN=false \
    TWITTER_POLL_INTERVAL=120 \
    TWITTER_SEARCH_ENABLE=FALSE \
    TWITTER_SPACES_ENABLE=false \
    ENABLE_TWITTER_POST_GENERATION=true \
    ENABLE_ACTION_PROCESSING=false \
    MAX_ACTIONS_PROCESSING=1 \
    ACTION_TIMELINE_TYPE=foryou \
    TWITTER_APPROVAL_ENABLED=false \
    TWITTER_APPROVAL_CHECK_INTERVAL=60000 \
    INSTAGRAM_DRY_RUN=false \
    IS_CHARITABLE=false \
    USE_CHARACTER_STORAGE=false \
    VERIFIABLE_INFERENCE_ENABLED=false \
    VERIFIABLE_INFERENCE_PROVIDER=opacity \
    OPACITY_TEAM_ID=f309ac8ae8a9a14a7e62cd1a521b1c5f \
    OPACITY_CLOUDFLARE_NAME=eigen-test \
    OPACITY_PROVER_URL=https://opacity-ai-zktls-demo.vercel.app \
    PYTH_NETWORK_ENV=mainnet \
    PYTH_GRANULAR_LOG=true \
    PYTH_LOG_LEVEL=info \
    RUNTIME_CHECK_MODE=false \
    PYTH_ENABLE_PRICE_STREAMING=true \
    PYTH_MAX_PRICE_STREAMS=2 \
    NVIDIA_NIM_ENV=production \
    NVIDIA_NIM_SPASH=false \
    NVIDIA_GRANULAR_LOG=true \
    NVIDIA_LOG_LEVEL=debug \
    EMAIL_AUTOMATION_ENABLED=false \
    ANKR_ENV=production \
    ANKR_MAX_RETRIES=3 \
    ANKR_RETRY_DELAY=1000 \
    ANKR_TIMEOUT=5000 \
    ANKR_GRANULAR_LOG=true \
    ANKR_LOG_LEVEL=debug \
    ANKR_RUNTIME_CHECK_MODE=false \
    ANKR_SPASH=true \
    ENABLE_TEE_LOG=false \
    REDPILL_API_KEY=${REDPILL_API_KEY}

# Expose necessary ports
EXPOSE 3000 5173

# Update the CMD to run with specific character
CMD ["sh", "-c", "pnpm start --character=\"characters/aave.agent.character.json\""]
