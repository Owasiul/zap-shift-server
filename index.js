const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.Stripe_key);

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_User}:${process.env.DB_Pass}@cluster0.ldvla9s.mongodb.net/?appName=Cluster0`;

const { customAlphabet } = require("nanoid");
const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 8);

function generateTrackingId() {
  const prefix = "ZS";
  const year = new Date().getFullYear().toString().slice(-2); // Last 2 digits
  const month = (new Date().getMonth() + 1).toString().padStart(2, "0");
  const uniqueId = nanoid();

  return `${prefix}${year}${month}${uniqueId}`;
  // Example: ZS2501A7K9M2N4
}

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
    const paymentColllection = zapShiftDB.collection("payments");

    // parcels api
    app.get("/all-parcel", async (req, res) => {
      try {
        const parcels = await parcelCollections.find().toArray();
        parcels.createdAt = new Date();
        res.send(parcels);
      } catch (error) {
        console.log(error);
        res.status(500).send({ error: "Failed to fetch parcels" });
      }
    });
    // set the sender email
    app.get(`/parcels`, async (req, res) => {
      try {
        const query = {};
        const { email } = req.query;
        if (email) {
          query["sender-email"] = email;
        }
        const options = { sort: { createdAt: -1 } };
        const parcels = await parcelCollections.find(query, options).toArray();
        parcels.createdAt = new Date();
        res.send(parcels);
      } catch (error) {
        console.log(error);
        res.status(500).send({ error: "Failed to fetch parcels" });
      }
    });
    // get via id
    app.get("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await parcelCollections.findOne(query);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ error: "Failed to find parcel" });
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

    app.delete("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await parcelCollections.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ error: "Failed to delete parcel" });
      }
    });

    // payment related api
    const YOUR_DOMAIN = process.env.Stripe_Domain;
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const paymentInfo = req.body;
        const amount = Math.round(paymentInfo.cost) * 100;
        // console.log({amount});

        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "bdt",
                unit_amount: amount,
                product_data: {
                  name: paymentInfo["parcel-name"],
                },
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          metadata: {
            parcelId: paymentInfo.parcelId,
            parcelName: paymentInfo["parcel-name"],
          },
          success_url: `${YOUR_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${YOUR_DOMAIN}/dashboard/payment-cancelled`,
        });

        // Only send JSON response - remove the redirect
        res.send({ url: session.url });
      } catch (error) {
        console.error("Payment error:", error);
        res.status(500).send({ error: error.message });
      }
    });

    app.patch("/verify-payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const TrackingId = generateTrackingId();
      // console.log("seession retrive", session);
      if (session.payment_status === "paid") {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            payment_status: "paid",
            trackingId: TrackingId,
          },
        };
        const result = await parcelCollections.updateOne(query, update);

        const paymentHistory = {
          amount: session.amount_total / 100,
          currency: session.currency,
          email: session.customer_details.email,
          parcelId: session.metadata.parcelId,
          parcelName: session.metadata.parcelName,
          transactionId: session.payment_intent,
          PaymentStatus: session.payment_status,
          paidAt: new Date(),
        };

        // console.log(paymentHistory);
        if (session.payment_status === "paid") {
          const resultPayment = await paymentColllection.updateOne(
            { transactionId: session.payment_intent },
            { $set: paymentHistory },
            { trackingId: TrackingId },
          );
          console.log(resultPayment);
          res.send({
            success: true,
            transactionId: session.payment_intent,
            trackingId: TrackingId,
            modifyPayment: result,
            paymentInfo: resultPayment,
          });
        } else {
          res.send({ success: false, message: "Payment Failed" });
        }
      }
    });

    // payment related api
    app.get("/payment-history", async (req, res) => {
      try {
        const email = req.query.email;
        const query = {};
        if (email) {
          query.email = email;
        }
        const cursor = await paymentColllection.find(query).toArray();
        res.send(cursor);
      } catch (error) {
        res.status(500).send("couldn't get the payments");
        console.error(error.message);
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
