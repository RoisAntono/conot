function tokenizeArgs(input) {
  const tokens = [];
  const pattern = /"([^"]+)"|'([^']+)'|`([^`]+)`|(\S+)/g;
  let match;

  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] || match[2] || match[3] || match[4]);
  }

  return tokens;
}

function parsePrefixedMessage(content, prefix) {
  if (!content.startsWith(prefix)) {
    return null;
  }

  const nextChar = content.slice(prefix.length, prefix.length + 1);
  if (nextChar && !/\s/.test(nextChar)) {
    return null;
  }

  const withoutPrefix = content.slice(prefix.length).trim();
  if (!withoutPrefix) {
    return null;
  }

  const args = tokenizeArgs(withoutPrefix);
  const commandName = args.shift()?.toLowerCase();

  if (!commandName) {
    return null;
  }

  return {
    commandName,
    args,
    raw: withoutPrefix
  };
}

module.exports = {
  parsePrefixedMessage,
  tokenizeArgs
};
