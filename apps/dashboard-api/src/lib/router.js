"use strict";

function compilePattern(pattern) {
  const paramNames = [];
  const escaped = pattern
    .split("/")
    .map((part) => {
      if (part.startsWith(":")) {
        paramNames.push(part.slice(1));
        return "([^/]+)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  return {
    regex: new RegExp(`^${escaped}$`),
    paramNames
  };
}

class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const compiled = compilePattern(pattern);
    this.routes.push({
      method: method.toUpperCase(),
      pattern,
      ...compiled,
      handler
    });
  }

  match(method, pathname) {
    const methodUpper = method.toUpperCase();
    for (const route of this.routes) {
      if (route.method !== methodUpper) {
        continue;
      }

      const match = pathname.match(route.regex);
      if (!match) {
        continue;
      }

      const params = {};
      route.paramNames.forEach((name, index) => {
        params[name] = decodeURIComponent(match[index + 1] || "");
      });

      return {
        handler: route.handler,
        params
      };
    }

    return null;
  }
}

module.exports = {
  Router
};
