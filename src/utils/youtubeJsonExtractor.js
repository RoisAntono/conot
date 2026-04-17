function extractObject(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) {
    return null;
  }

  let index = start + marker.length;
  while (index < source.length && source[index] !== "{") {
    index += 1;
  }

  if (source[index] !== "{") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  const begin = index;

  for (; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }

      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(begin, index + 1);
      }
    }
  }

  return null;
}

module.exports = {
  extractObject
};
