function formatMessage(level, message, error) {
  const timestamp = new Date().toISOString();
  const lines = [`[${timestamp}] [${level}] ${message}`];

  if (error instanceof Error) {
    lines.push(error.stack || error.message);
  } else if (error) {
    lines.push(String(error));
  }

  return lines.join("\n");
}

function info(message) {
  console.log(formatMessage("INFO", message));
}

function warn(message, error) {
  console.warn(formatMessage("WARN", message, error));
}

function error(message, err) {
  console.error(formatMessage("ERROR", message, err));
}

module.exports = {
  info,
  warn,
  error
};
