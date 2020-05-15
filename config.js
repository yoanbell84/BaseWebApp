// config.js
const dotenv = require('dotenv');
dotenv.config();
module.exports = {
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  port: process.env.PORT,
  scope: process.env.SCOPE,
  nodeMode: process.env.NODE_MODE,
  devApiKey: process.env.DEV_API_KEY,
  firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL,
  firebaseServiceAccount:process.env.FIREBASE_SERVICE_ACCOUNT
};