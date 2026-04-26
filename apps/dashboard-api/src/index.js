"use strict";

const { createApiServer } = require("./server");

const app = createApiServer();
app.start();
