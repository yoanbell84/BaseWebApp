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
  firebaseServiceAccount: { 
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri:process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url:process.env.FIREBASE_AUTH_PROVIDER_CERT,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_PROVIDER_CERT,
  }
};