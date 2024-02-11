const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;

// middlewares
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      // "https://daily-pulse-newspaper.web.app",
      // "https://daily-pulse-newspaper.firebaseapp.com"
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@newsblogs.gtqtaqh.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// middlewares
const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access!" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access!" });
    }
    req.decoded = decoded;
    next();
  });
};

// const verifyToken = (req, res, next) => {
//   console.log("inside verify token", req.headers.Authorization);
// }

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );

    // collections
    const articles = client.db("newspaperDB").collection("articles");
    const publishers = client.db("newspaperDB").collection("publishers");
    const users = client.db("newspaperDB").collection("users");

    // ------------------------------------custom middlewares-------------------------------------------

    // verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const userEmail = req?.decoded?.email;
      const filter = { email: userEmail };
      const user = await users.findOne(filter);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access!" });
      }
      next();
    };

    // ------------------------------------auth/jwt api-------------------------------------------
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    app.post("/logout", (req, res) => {
      const user = req.body;
      res
        .clearCookie("token", {
          maxAge: 0,
        })
        .send({ success: true });
    });

    // ------------------------------------subscription plans api-------------------------------------------

    // update subscription period
    app.put("/articles", verifyToken, async (req, res) => {
      const filter = { isPremium: true };
      const options = { upsert: true };
      const updatedDoc = req.body;
      const doc = {
        $set: {
          subscriptionPeriod: updatedDoc.subscriptionPeriod,
        },
      };
      const result = await articles.updateMany(filter, doc, options);
      res.send(result);
    });

    // ------------------------------------users all api-------------------------------------------
    // get all users
    app.get("/users", async (req, res) => {
      const result = await users.find().toArray();
      res.send(result);
    });

    // find users by premium status
    app.get("/premiumUsers", async (req, res) => {
      const query = { premiumUser: "true" };
      const result = await users.find(query).toArray();
      res.send(result);
    });

    // find users by regular status
    app.get("/regularUsers", async (req, res) => {
      const filter = { premiumUser: null };
      const result = await users.find(filter).toArray();
      res.send(result);
    });

    // make admin
    app.put("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedRole = req.body;
      const doc = {
        $set: {
          role: updatedRole.role,
        },
      };
      const result = await users.updateOne(filter, doc, options);
      res.send(result);
    });

    // delete a user
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await users.deleteOne(filter);
      res.send(result);
    });

    // get admin form all users
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;
      if (req?.decoded?.email != userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const filter = { email: userEmail };
      const user = await users.findOne(filter);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // get a user by email
    app.get("/user/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;
      const filter = { email: userEmail };
      const result = await users.findOne(filter);
      res.send(result);
    });

    // update a user by email
    app.put("/updateUser/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;
      const filter = { email: userEmail };
      const options = { upsert: true };
      const updatedDoc = req.body;
      const doc = {
        $set: {
          name: updatedDoc.name,
          image: updatedDoc.image,
          email: updatedDoc.email,
        },
      };
      const result = await users.updateOne(filter, doc, options);
      res.send(result);
    });

    // update a user status to premium by email
    app.put("/user/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;
      const filter = { email: userEmail };
      const options = { upsert: true };
      const updatedDoc = req.body;
      const doc = {
        $set: {
          premiumUser: updatedDoc.premiumUser,
        },
      };
      const result = await users.updateOne(filter, doc, options);
      res.send(result);
    });

    // post users
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const filter = await users.findOne(query);
      // checking if user already exists and return null if found
      if (filter) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      // const result = await users.insertOne(user);
      // res.send(result);
      res.send(user);
    });

    // ------------------------------------articles all api-------------------------------------------

    // get all articles
    app.get("/articles", verifyToken, verifyAdmin, async (req, res) => {
      const result = await articles.find().toArray();
      res.send(result);
    });
    // get article by id
    app.get("/article/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await articles.findOne(query);
      res.send(result);
    });
    // approved articles
    app.get("/approvedArticles", async (req, res) => {
      const query = { status: "approved" };
      const result = await articles.find(query).toArray();
      res.send(result);
    });
    // sorted articles by view
    app.get("/articlesByView", async (req, res) => {
      const query = { status: "approved" };
      const options = {
        sort: { views: -1 },
      };
      const result = await articles.find(query, options).toArray();
      res.send(result);
    });
    // premium articles
    app.get("/premiumArticles", verifyToken, async (req, res) => {
      const query = {
        isPremium: true,
        status: "approved",
      };
      const result = await articles.find(query).toArray();
      res.send(result);
    });
    // articles by author email
    app.get("/articleByAuthor/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "forbidden access!" });
      }
      const query = { authorEmail: email };
      const result = await articles.find(query).toArray();
      res.send(result);
    });
    // post a article
    app.post("/articles", verifyToken, async (req, res) => {
      const article = req.body;
      const result = await articles.insertOne(article);
      res.send(result);
    });
    // delete a article
    app.delete("/articles/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await articles.deleteOne(filter);
      res.send(result);
    });
    // update article by views
    app.put("/articles/updateView/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = req.body;
      const doc = {
        $set: {
          views: updatedDoc.views,
        },
      };
      const result = await articles.updateOne(filter, doc, options);
      res.send(result);
    });

    // update article status
    app.put("/articles/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedStatus = req.body;
      const doc = {
        $set: {
          status: updatedStatus.status,
        },
      };
      const result = await articles.updateOne(filter, doc, options);
      res.send(result);
    });

    // update article cancelation status
    app.put("/cancelationUpdate/:id", async (req, res) => {
      const id = req.params.id;
      const filer = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = req.body;
      const doc = {
        $set: {
          cancelationText: updatedDoc.cancelationText,
        },
      };
      const result = await articles.updateOne(filer, doc, options);
      res.send(result);
    });

    // update article by id
    app.put("/updateArticle/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = req.body;
      const doc = {
        $set: {
          title: updatedDoc.title,
          image: updatedDoc.image,
          publisher: updatedDoc.publisher,
          publisherImage: updatedDoc.publisherImage,
          tag: updatedDoc.tag,
          description: updatedDoc.description,
        },
      };
      const result = await articles.updateOne(filter, doc, options);
      res.send(result);
    });

    // ------------------------------------publishers all api-------------------------------------------

    // post e publisher
    app.post("/publishers", verifyToken, verifyAdmin, async (req, res) => {
      const publisher = req.body;
      const result = await publishers.insertOne(publisher);
      res.send(result);
    });

    // publisher api
    app.get("/publishers", async (req, res) => {
      const result = await publishers.find().toArray();
      res.send(result);
    });
    // publisher by publisher name
    app.get("/publisher/:publisher", verifyToken, async (req, res) => {
      const publisherParams = req.params.publisher;
      const query = { publisher: publisherParams };
      const result = await publishers.findOne(query);
      res.send(result);
    });

    // delete a publisher by id
    app.delete(
      "/publishers/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const result = await publishers.deleteOne(filter);
        res.send(result);
      }
    );

    // --------------------------------------ping section--------------------------------------------------------
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (e) {
    console.log(e); 
  } 
}
run().catch(console.dir);

// server status
app.get("/", (req, res) => {
  res.send("Newspaper server is running at port 5002");
});
app.listen(port, () => {
  console.log(`Newspaper server is running at http://localhost:${port}`);
});
