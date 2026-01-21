const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const cors = require("cors");
require("dotenv").config();

// middleware
app.use(express.json());
app.use(cors);

// listeners
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "zap shift server" });
});

app.listen(port, () => {
  console.log(`Zap shift server is listening ${port}`);
  console.log(`Zap shift server Connect with DB`);
});
