// config.js
const dotenv = require('dotenv');
dotenv.config();
module.exports = {
  hubspotClientId: process.env.HUBSPOT_CLIENT_ID,
  hubspotClientSecret: process.env.HUBSPOT_CLIENT_SECRET,
  hubspotWebhookUrl:process.env.HUBSPOT_WEBHOCK_URL,
  port: process.env.PORT,
  hubspotScope: process.env.HUBSPOT_SCOPE,
  nodeENV: process.env.NODE_ENV,
  hubspotDevApiKey: process.env.HUBSPOT_DEV_API_KEY,
  firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL,
  redisURL:process.env.REDIS_URL,
  firebaseServiceAccount: { 
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri:process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url:process.env.FIREBASE_AUTH_PROVIDER_CERT,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_PROVIDER_CERT,
  }
};