# The Shield reasoning server.
#
# WHY THIS EXISTS
#
# "Runs on my machine" is not a deployable product, and the install instructions
# depend on a Python version whose wheels matter: requirements.txt is pinned to
# releases with prebuilt wheels for 3.14 precisely because an earlier pin fell
# back to building pydantic-core from source and needed a Rust toolchain. This
# image removes that whole class of problem from whoever runs it next.
#
# WHY IT STILL BINDS TO LOOPBACK ON THE HOST
#
# Shield's default endpoint is 127.0.0.1:8787 and that is a deliberate position,
# not a development shortcut: a build that silently points at somebody's hosted
# endpoint is a build that can leak by accident. The run command below therefore
# publishes the port to the host's loopback only. Dropping the `127.0.0.1:` and
# exposing this container to a network makes it an unauthenticated endpoint that
# anyone who finds it can drive, because the server has no auth and no rate
# limit by design - it was written to be reached from the same machine.
#
#   docker build -t shield-server ./server
#   docker run --rm -p 127.0.0.1:8787:8787 shield-server
#
# With the optional reasoning model, pointing at a model on the host:
#
#   docker run --rm -p 127.0.0.1:8787:8787 \
#     -e SHIELD_MODEL_ENDPOINT=http://host.docker.internal:11434/v1/chat/completions \
#     -e SHIELD_MODEL_NAME=qwen2.5vl:7b \
#     -e SHIELD_MODEL_KEY=ollama \
#     -e SHIELD_MODEL_TIMEOUT=600 \
#     shield-server
#
# With no model configured the server answers from the rule-based path, which
# runs the whole demo. That is the contingency, not a degraded mode.

FROM python:3.14-slim

# Fail fast and log straight through, rather than buffering output that a
# reader is waiting on to find out whether the thing started.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Dependencies before source, so editing a .py file does not reinstall FastAPI.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Only what the server actually runs. The test files and the vision verification
# harness are deliberately left out: the harness needs Pillow, which is not a
# runtime dependency and has no business in a shipped image.
COPY main.py prompt.py reasoner.py model_reasoner.py schemas.py ./

# Nothing here needs root.
RUN useradd --create-home --uid 10001 shield
USER shield

EXPOSE 8787

# 0.0.0.0 inside the container is the container's own interface, reachable only
# through whatever the run command publishes - which is loopback, above.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8787"]
