const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const cors = require("cors");
require("dotenv").config();
const { MongoClient } = require("mongodb");

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_User}:${process.env.DB_Pass}@cluster0.ldvla9s.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri);

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "zap shift server" });
});

// Connect to MongoDB and start server
client
  .connect()
  .then(() => {
    console.log("Successfully connected to MongoDB!");

    // database name
    const zapShiftDB = client.db("zapShiftDB");
    const parcelCollections = zapShiftDB.collection("parcels");

    // parcels api
    app.get("/parcels", async (req, res) => {
      try {
        const parcels = await parcelCollections.find().toArray();
        res.send(parcels);
      } catch (error) {
        console.log(error);
        res.status(500).send({ error: "Failed to fetch parcels" });
      }
    });

    app.post("/parcels", async (req, res) => {
      try {
        const parcel = req.body;
        const result = await parcelCollections.insertOne(parcel);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ error: "Failed to create parcel" });
      }
    });

    // Send a ping to confirm a successful connection
    client.db("admin").command({ ping: 1 });

    // Start server after DB connection
    app.listen(port, () => {
      console.log(`Zap shift server is listening on port ${port}`);
      console.log(`Zap shift server connected with DB`);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  });