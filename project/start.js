var express = require( 'express' );
const config = require( '../config' );
const NodeCache = require('node-cache');
const redis = require( 'redis' );
const session = require( 'express-session' );
let RedisStore = require( 'connect-redis' )( session );
const request = require( 'request-promise-native' );
let redisClient = config.nodeENV === 'production' ? redis.createClient( config.redisURL ) : redis.createClient({
  host: 'localhost',
  port: 6379,
  db: 1,
});
redisClient.on( 'error', ( err ) =>
{
  console.log('Redis error: ', err);
} );

const crypto = require( 'crypto' );
const PORT = ( config.port || 5000 );

// const FirebaseStore = require( 'connect-session-firebase' )( session );
// const firebase = require( 'firebase-admin' );

var app = express();
app.use(express.json());       // to support JSON-encoded bodies
app.use( express.urlencoded({ extended: true }) ); // to support URL-encoded bodies





// const ref = firebase.initializeApp( {
//   credential: firebase.credential.cert(config.firebaseServiceAccount),
//   databaseURL: config.firebaseDatabaseUrl
// });


let refreshTokenStore = {};
const accessTokenCache = new NodeCache( { deleteOnExpire: true } );

if (!config.hubspotClientId || !config.hubspotClientSecret) {
  throw new Error('Missing CLIENT_ID or CLIENT_SECRET environment variable.')
}


app.set('port', PORT);
app.use( express.static( __dirname ) );

// views is directory for all template files
app.set('views', __dirname + '/html');
app.set( 'view engine', 'ejs' );


const productList = [
  {
      hs_product_id: 101043994,
      quantity: 3,
      price: 749.99,
      name: 'Xenio-50',
      discount: 12
   
  }, {
   
      hs_product_id: 101043992,
      quantity: 3,
      price: 20,
      name: 'RFID -10C'
   
  }
]

var userId, userEmail, dealId = null;
let quotes = [];

const getDefaultQuote = () =>
{ 
  return [
    {
      title: 'Quote',
      link: null,
      objectId: 1,
      properties: [ {
        label: "Status",
        dataType: "STATUS",
        optionType: "WARNING",
        value: "Not created"
      } ]
    } ]
};

const getPrimaryActions = (actionUrl,label = "Create CRM Quote") =>
{ 
  return {
    type: "IFRAME",
    width: 800,
    height: 800,
    uri: actionUrl,
    label: label
  };
}
const getSecondaryActions = ( quoteIds ) =>
{
  let options = [];
  // if ( quoteIds && quoteIds.length > 0 )
  // { 
  //   quoteIds.map( id =>
  //   { 
  //     options.push(
     
  //   );
  // })
// }
  return options;
 
} 




//===========================================================================//
//  HUBSPOT APP CONFIGURATION
//
//  All the following values must match configuration settings in your app.
//  They will be used to build the OAuth URL, which users visit to begin
//  installing. If they don't match your app's configuration, users will
//  see an error page.

// Replace the following with the values from your app auth config, 
// or set them as environment variables before running.
const CLIENT_ID = config.hubspotClientId;
const CLIENT_SECRET = config.hubspotClientSecret;


// Scopes for this app will default to `contacts`
// To request others, set the SCOPE environment variable instead
let SCOPES = ['contacts'];
if (config.hubspotScope) {
    SCOPES = (config.hubspotScope.split(/ |, ?|%20/)).join(' ');
}

// On successful install, users will be redirected to /oauth-callback
const base_url = config.nodeENV == 'local' ? `http://localhost:${ PORT }` : 'https://enigmatic-tor-68993.herokuapp.com';
const REDIRECT_URI = config.nodeENV == 'local' ? `http://localhost:${ PORT }/oauth-callback` : 'https://enigmatic-tor-68993.herokuapp.com/oauth-callback';



//===========================================================================//

// // Use a session to keep track of client ID
// app.use(session({
//   secret: Math.random().toString(36).substring(2),
//   resave: false,
//   saveUninitialized: true
// }));

 
// express()
//   .use(session({
//     store: new FirebaseStore({
//       database: ref.database()
//     }),
//     secret: 'keyboard cat',
//     resave: true,
//     saveUninitialized: true
//   }));

 
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: 'ThisIsHowYouUseRedisSessionStorage',
  name: '_redisEasyworkforceSync',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }, // Note that the cookie-parser module is no longer needed
  
}));
//================================//
//   Running the OAuth 2.0 Flow   //
//================================//

// Step 1
// Build the authorization URL to redirect a user
// to when they choose to install the app
const authUrl =
  'https://app.hubspot.com/oauth/authorize' +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` + // app's client ID
  `&scope=${encodeURIComponent(SCOPES)}` + // scopes being requested by the app
  `&redirect_uri=${REDIRECT_URI}`; // where to send the user after the consent page

// Redirect the user from the installation page to
// the authorization URL
app.get('/install', (req, res) => {
  console.log('');
  console.log('=== Initiating OAuth 2.0 flow with HubSpot ===');
  console.log('');
  console.log("===> Step 1: Redirecting user to your app's OAuth URL");
  res.redirect(authUrl);
  console.log('===> Step 2: User is being prompted for consent by HubSpot');
});

// Step 2
// The user is prompted to give the app access to the requested
// resources. This is all done by HubSpot, so no work is necessary
// on the app's end

// Step 3
// Receive the authorization code from the OAuth 2.0 Server,
// and process it based on the query parameters that are passed
app.get('/oauth-callback', async (req, res) => {
  console.log('===> Step 3: Handling the request sent by the server');

  // Received a user authorization code, so now combine that with the other
  // required values and exchange both for an access token and a refresh token
  if (req.query.code) {
    console.log('       > Received an authorization token');

    const authCodeProof = {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code: req.query.code
    };

    // Step 4
    // Exchange the authorization code for an access token and refresh token
    console.log('===> Step 4: Exchanging authorization code for an access token and refresh token');
    const token = await exchangeForTokens(req.sessionID, authCodeProof);
    if (token.message) {
      return res.redirect(`/error?msg=${token.message}`);
    }

    // Once the tokens have been retrieved, use them to make a query
    // to the HubSpot API
    res.redirect(`/`);
  }
});

//==========================================//
//   Exchanging Proof for an Access Token   //
//==========================================//

const exchangeForTokens = async (userId, exchangeProof) => {
  try {
    const responseBody = await request.post('https://api.hubapi.com/oauth/v1/token', {
      form: exchangeProof
    });
    // Usually, this token data should be persisted in a database and associated with
    // a user identity.
    const tokens = JSON.parse( responseBody );
    refreshTokenStore = tokens;
    refreshTokenStore.updatedAt = Date.now();
    // console.log( 'Store:', refreshTokenStore )
    // refreshTokenStore[userId] = tokens.refresh_token;
    // accessTokenCache.set(userId, tokens.access_token, Math.round(tokens.expires_in * 0.75));
    accessTokenCache.set(tokens.refresh_token, tokens.access_token, Math.round(tokens.expires_in * 0.75));

    console.log('       > Received an access token and refresh token');
    return tokens.access_token;
  } catch (e) {
    console.error(`       > Error exchanging ${exchangeProof.grant_type} for access token`);
    return JSON.parse(e.response.body);
  }
};

const refreshAccessToken = async ( userId ) =>
{
  console.log('Refresh',refreshTokenStore)
  const refreshTokenProof = {
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    refresh_token: refreshTokenStore.refresh_token
  };
  return await exchangeForTokens(userId, refreshTokenProof);
};

const getAccessToken =  async (userId) => {
  // If the access token has expired, retrieve
  // a new one using the refresh token
  // if (!accessTokenCache.get(userId)) {
  if (!accessTokenCache.get(refreshTokenStore.refresh_token)) {
  console.log( 'Refreshing expired access token' );
    await refreshAccessToken(userId);
  }
  return accessTokenCache.get(refreshTokenStore.refresh_token);
};

// const isAuthorized = (userId) => {
//   return refreshTokenStore[userId] ? true : false;
// };


const isAuthorized = (userId) => {
  return refreshTokenStore.refresh_token;
}

// const isTokenExpired = () => {
//   return Date.now() >= refreshTokenStore.updatedAt + refreshTokenStore.expires_in * 1000
// }

//====================================================//
//    Creating New Quote                               //
//====================================================//

const createQuote = async ( accessToken ) =>
{
  console.log( '' );
  console.log( '=== Creating New Quote from HubSpot using the access token ===' );
  console.log( '===> request.post(\'https://api.hubapi.com/crm/v3/objects/quotes\')' );

  var options = {
    url: 'https://api.hubapi.com/crm/v3/objects/quotes',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ accessToken }`,
      'Content-Type': 'application/json'
    },
    body: {
      properties: {
        "hs_expiration_date": "2020-07-31T03:59:59.999Z",
        "hs_status": "APPROVAL_NOT_NEEDED",
        "hs_title": "Test Create Quote"
      }
    },
    json: true
  }

  const result = await request( options ).then( result => result ).catch( err => err.response.body );
 
  return result;
};



//====================================================//
//    Creating New Line Items                         //
//====================================================//

const createLineItems = async ( accessToken ) =>
{
  console.log( '' );
  console.log( '=== Creating Line Items from HubSpot using the access token ===' );
  console.log( '===> request.post(\'https://api.hubapi.com/crm/v3/objects/line_items/batch/create\')' );


  var options = {
    url: 'https://api.hubapi.com/crm/v3/objects/line_items/batch/create',
    // url: 'https://api.hubapi.com/crm-objects/v1/objects/line_items/batch-create',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ accessToken }`,
      'Content-Type': 'application/json'
    },
    body: {
      inputs: [ ...productList.map( prod => ({ properties: prod}))]
    },
    
    //  body:   [
    //     { name:'hs_product_id' , value: 101043990 },
    //     { name:'quantity' , value: 2},
    //     { name:'price' , value: 899},
    //     { name:'name' , value:'Xenio-500'}
        
    //   ],
    //   [
    //     { name:'hs_product_id' , value: 101043994 },
    //     { name:'quantity' , value: 4},
    //     { name:'price' , value: 749},
    //     { name:'name' , value:'Xenio-50'}
    //   ]
    // ],
  
    json: true
  }

  const result = await request( options ).then( result => result ).catch( err => err.response.body );
 
  return result;
};

//====================================================//
//    Asociate New Line Items to a deal               //
//====================================================//


const asociateLineItemsWithDeal = async ( accessToken, dealId,lineItemIds ) =>
{
  console.log( '' );
  console.log( '=== Asociate Line Items With Deal from HubSpot using the access token ===' );
  console.log( '===> request.post(\'https://api.hubapi.com/crm/v3/associations/line_items/deal/batch/create\')' );
  console.log( `=== Asociate Line Items ${ JSON.stringify( lineItemIds ) } With Deal from HubSpot using the access token ===` );
  
  const items = lineItemIds.map( element =>
  {
    return {
      from: {
        id: element
      },
      to: {
        id: dealId
      },
      type: "line_item_to_deal"
    }
  } );
  console.log(`=== Line Items ${ JSON.stringify( items ) }`)
  var options = {
    // url: `https://api.hubapi.com/crm-associations/v1/associations/create-batch`,
    url:'https://api.hubapi.com/crm/v3/associations/line_items/deal/batch/create',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ accessToken }`,
      'Content-Type': 'application/json'
    },
    // body:lineItemIds.map( element => {
    //     return {
    //       fromObjectId:element,
    //       toObjectId: dealId,
    //       category: "HUBSPOT_DEFINED",
    //       definitionId: 20
    //     }
    //   }),
    body: {
      inputs:items,
    },
    json: true
  }

  const result = await request( options ).then( result => result ).catch( err => err.response.body );
 
  return result;
};
 

//====================================================//
//    Delete Previous Associated Line Items to a deal //
//====================================================//


const deleteAsscociatedLineItemsWithDeal = async ( accessToken, dealId,lineItemIds ) =>
{
  console.log( '' );
  console.log( '=== Deleted Asociated Line Items With Deal from HubSpot using the access token ===' );
  console.log( '===> request.post(\'https://api.hubapi.com/crm/v3/associations/line_items/deal/batch/archive\')' );
  console.log( `===  Deleted Asociated Line Items ${ JSON.stringify( lineItemIds ) } With Deal from HubSpot using the access token ===` );
  
  const items = lineItemIds.map( element =>
  {
    return {
      from: {
        id: element
      },
      to: {
        id: dealId
      },
      type: "line_item_to_deal"
    }
  } );
  console.log(`=== Line Items ${ JSON.stringify( items ) }`)
  var options = {
    // url: `https://api.hubapi.com/crm-associations/v1/associations/create-batch`,
    url:'https://api.hubapi.com/crm/v3/associations/line_items/deal/batch/archive',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ accessToken }`,
      'Content-Type': 'application/json'
    },
    body: {
      inputs:items,
    },
    json: true
  }

  const result = await request( options ).then( result => result ).catch( err => err.response.body );
 
  return result;
};
 



//====================================================//
//    Asociate Quote to a deal               //
//====================================================//


const asociateQuotesWithDeal = async ( accessToken, dealId, quoteIds ) =>
{
  console.log( '' );
  console.log( '=== Asociate Quote With Deal from HubSpot using the access token ===' );
  console.log( '===> request.post(\'https://api.hubapi.com/crm/v3/associations/quote/deal/batch/create\')' );

  var options = {
    // url: `https://api.hubapi.com/crm-associations/v1/associations/create-batch`,
    url:'https://api.hubapi.com/crm/v3/associations/quote/deal/batch/create',
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${ accessToken }`,
      'Content-Type': 'application/json'
    },
    // body:lineItemIds.map( element => {
    //     return {
    //       fromObjectId:element,
    //       toObjectId: dealId,
    //       category: "HUBSPOT_DEFINED",
    //       definitionId: 20
    //     }
    //   }),
    body: {
      inputs:quoteIds.map( element =>
        {
        return {
          from: {
            id:element
          },
          to: {
            id:dealId
          },
          type:"quote_to_deal"          
        }
      }),
    },
    json: true
  }

  const result = await request( options ).then( result => result ).catch( err => err.response.body );
 
  return result;
};


//====================================================//
//   Update a deal                                    //
//====================================================//


const UpdateDeal = async ( accessToken,deal) =>
{
  const { id } = deal;
  console.log( '' );
  console.log( `=== Update Deal ${id} from HubSpot using the access token ===` );
  console.log( `===> request.post(\'https://api.hubapi.com/crm/v3/objects/deals/${id}\')` );

  const amount = productList.map( prod => prod.quantity * prod.price ).reduce( ( a, b ) => ( a || 0 ) + ( b || 0 ) );
  var options = {
    url: `https://api.hubapi.com/crm/v3/objects/deals/${id}`,
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${ accessToken }`,
      'Content-Type': 'application/json'
    },
    body: {
      // properties: [
      //   { name: "amount", value: finalAmout },
      //   { name:'assigned_channel', value: 1},
      //   { name:'tax', value: 150},
      //   { name:'shipping', value: 230},
      //   { name:'max_users', value: 20},
      //   { name:'dealstage', value: 'qualifiedtobuy'}
      // ]
      properties: {
        amount: amount,
        assigned_channel: 1,
        tax: 150,
        shipping: 130,
        max_users: 50,
        dealstage: 'qualifiedtobuy',
        active_quote: '12'
      }
    },
    json: true
  }

  const result = await request( options ).then( result => result ).catch( err => console.log(err) );
 
  return result;
};


const getDeal = async ( accessToken,dealId) =>
{
  console.log( '' );
  console.log( `=== Get Deal Information ${dealId} from HubSpot using the access token ===` );
  console.log( `===> request.get(\'https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=max_users,tax,shipping,dealstage,dealname,closedate,amount&associations=line_items,company,contact\')` );

  
  var options = {
    url: `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=max_users,tax,shipping,dealstage,dealname,closedate,amount&associations=line_items,company,contact`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${ accessToken }`,
      'Content-Type': 'application/json'
    }   
  }

  const result = await request( options ).then( result => JSON.parse(result)).catch( err => console.log(err) );
 
  return result;
};

const isValid = (req) =>
{

  let result = true; 
  if ( !req.headers[ 'x-hubspot-signature' ] ) result = false;
  else if ( req.headers[ 'x-hubspot-signature' ] )
  { 
    var requestSignature = req.headers[ 'x-hubspot-signature' ];
    let clientSecret = CLIENT_SECRET;
    let httpMethod = req.method;
    let body = Object.keys(req.body).length === 0 ? null : JSON.stringify(req.body);
    let httpURI = req.headers['x-forwarded-proto'] + '://' + req.headers.host + req.url;
   
    let sourceString = clientSecret + httpMethod + httpURI;
    if ( body ) sourceString = clientSecret + httpMethod + httpURI + body;

    let hash = crypto.createHash( 'sha256' ).update( sourceString ).digest( 'hex' );
    console.log( 'Params =======>', [ clientSecret, httpMethod, httpURI, body ] )
    console.log( 'Source String =======>' ,sourceString)
    console.log( 'Request Signature =======>', requestSignature );
    console.log( 'Hash Without Body =======>', crypto.createHash( 'sha256' ).update( clientSecret + httpMethod + httpURI ).digest( 'hex' ))
    console.log( 'Hash Signature =======>', hash )
    
    if ( hash !== requestSignature )
      result = false;
  }
  return result
}

const createQuoteObj = (name,title, userEmail ,contactEmail,amount) =>
{ 
  let id = Math.floor( Math.random() * 100001 );
  var today = new Date( Date.now() );
  var date = today.toISOString().split( 'T' )[ 0 ];
  today.setMonth((today.getMonth() + 1) + 2);
  var expiringDate = today.toISOString().split( 'T' )[ 0 ];
  
  console.log('AMOUNT', typeof(amount))
  const result = {
    objectId: id,
    title: `Quote ${name}`,
    link: null,//`${ base_url }/quotes/${ id }`,
    createdAt: date,
    amount:Number(amount),
    status: "active",
    properties: [
      // {
      //   label: "Created",
      //   dataType: "DATE",
      //   value: date
      // },
      // {
      //   label: "Status",
      //   name: "status",
      //   dataType: "STATUS",
      //   optionType: "SUCCESS",
      //   value: "Active"
      // // },    
      // {
      //   label: "Amount",
      //   dataType: "CURRENCY",
      //   value: amount,
      //   currencyCode: "USD"
      // },
      {
        label: "Expiring",
        dataType: "DATE",
        value: expiringDate
      }
    ],
    actions: [
        {
            type: "IFRAME",
            width: 800,
            height: 800,
            uri: `${ base_url }/quotes/edit/${ id }`,
            label: "Edit"
        },
        {
            // type: "CONFIRMATION_ACTION_HOOK",
            // confirmationMessage: "Are you sure you want to delete this quote",
            // confirmButtonText: "Yes",
            // cancelButtonText: "No",
            // httpMethod: "DELETE",
            // uri: `${ base_url }/quotes/${ id }`,
            // label: "Delete"
            
            type: "IFRAME",
            width: 800,
            height: 800,
            uri: `${ base_url }/quotes/${ id }/convert`,
            label: "Convert to order"
          
        }
    ]
  };

  return result 
}


//====================================================//
//   Routes                                           //
//====================================================//

app.get( '/', async ( req, res ) => 
{
  if ( !isAuthorized( req.sessionID ) )
  {
    res.redirect( authUrl );
  }
  else
  { 
    const accessToken = await getAccessToken(req.sessionID);
    res.render( 'pages/index', {token: accessToken} );
  }
  res.end();
  
} );

app.get( '/quotes/create', ( req, res ) => 
{
  userId = req.query.userId;
  dealId = req.query.dealId;
  userEmail = req.query.userEmail;
  res.header( 'first_name', 'HelloWorld' );
  res.render( 'pages/quote');
} );

app.get( '/quotes/edit/:quoteId', async( req,res) =>
{
 res.write( `<div>Editing Quote ${ req.params.quoteId }</div>` );   
} );

app.get( '/quotes/:quoteId', async( req,res) =>
{
 res.write( `<div>View Quote ${ req.params.quoteId }</div>` );   
} );

app.get( '/quotes', function ( req, res )
{

  if ( !isValid(req) )
    res.sendStatus(403)
  else
  {
    
    let userId = req.query.userId;
    let userEmail = req.query.userEmail;
    let associatedObjectId = req.query.associatedObjectId;
    let associatedObjectType = req.query.associatedObjectType;
    let portalId = req.query.portalId;

    // let iframeHttpURI = `${ base_url }/new-quote?userId=${ userId }&userEmail=${ userEmail }&dealId=${ associatedObjectId }`;
    let iframeHttpURI = `${base_url}/quotes/create?userId=${ userId }&userEmail=${ userEmail }&dealId=${ associatedObjectId }&portalId=${portalId}`;
    
    let quoteResult = quotes.length > 0 && quotes || getDefaultQuote();
    let primaryOption = quotes && quotes.length == 0 && getPrimaryActions( iframeHttpURI ) || null;
    let secondaryOptions = quotes.length > 0 && getSecondaryActions(quotes.map(q=>q.objectId)) || null;

    var options = {
      results: quoteResult,
      primaryAction: primaryOption,
      secondaryActions: secondaryOptions,
      // results: [
      //   {
      //     quote_name: 'Quote Test',
      //     objectId: 232,
      //     title: 'Test-Yoan',
      //     link: 'https://enigmatic-tor-68993.herokuapp.com/test-yoan',
      //     properties: [
      //       {
      //         label: "Seller",
      //         dataType: "EMAIL",
      //         value: "ybell@easyworkforce.com"
      //       },
      //       {
      //         label: "Amount",
      //         dataType: "CURRENCY",
      //         value: "150",
      //         currencyCode: "USD"
      //       }
      //     ],
      //     actions: [
      //       {
      //         type: "IFRAME",
      //         width: 800,
      //         height: 800,
      //         uri: "https://tools.hubteam.com/integrations-iframe-test-app",
      //         label: "Edit"
      //       },
      //       {
      //         type: "CONFIRMATION_ACTION_HOOK",
      //         confirmationMessage: "Are you sure you want to delete this quote",
      //         confirmButtonText: "Yes",
      //         cancelButtonText: "No",
      //         httpMethod: "DELETE",
      //         uri: "https://api.hubapi.com/linked-sales-objects-test-application/v1/actions/demo-ticket/988",
      //         label: "Delete"
      //       }
      //     ]
      //   }
      // ],
     
    }
    return res.json( options );
  }
} );

app.post( '/quotes', async ( req, res ) =>
{
 
  // let dealId = req.body.dealId;
  let quote_name = req.body.quote_name;
  let seller = 'ybell@'
  
  let lineIds, quoteId = null;
  
  console.log( 'RefreshTokenStore Create Quote', refreshTokenStore )
  console.log( 'req.sessionID', req.sessionID )
  const accessToken = await getAccessToken( req.sessionID );

    // quoteId = await createQuote( accessToken ).then( qResult =>
    // { 
    //   console.log( '=== Succesfully Created Quote from HubSpot using the access token ===' );
    //   console.log( 'Quote =====>', JSON.stringify(qResult, null , 2) )
    //     return qResult && qResult.id;
    // } );
  if(!dealId) return res.sendStatus( 400 );
  
    let deal = await getDeal( accessToken, dealId ).then( dealResult =>
    {
      console.log( '=== Retrieving Deal Info from HubSpot using the access token ===' );
      console.log( 'Deal =====>', dealResult && JSON.stringify( dealResult ) );
      return dealResult || null;
    } );
  
    if(!deal) return res.sendStatus( 400 );
  
  let existingItems = deal && deal.associations && deal.associations.line_items && deal.associations.line_items.results && deal.associations.line_items.results.length > 0 && deal.associations.line_items.results.map( r => r.id ) || [];

  if ( existingItems.length > 0 )
  { 
    await deleteAsscociatedLineItemsWithDeal( accessToken,deal.id,existingItems ).then( itemsResult =>
    { 
      console.log( '=== Deleting Associated Line Items from HubSpot using the access token ===' );
      console.log( 'Associated Line Items=====>', itemsResult)
    } );
  }
  
  lineIds = await createLineItems( accessToken ).then( itemsResult =>
      {
        console.log( '=== Succesfully Created Line Items  from HubSpot using the access token ===' );
        console.log( 'Line Items=====>', itemsResult && itemsResult.results && itemsResult.results.length > 0 && itemsResult.results.map( r => r.id ))
        return itemsResult && itemsResult.results && itemsResult.results.length > 0 && itemsResult.results.map( r => r.id );
      } );
  
      if(!lineIds) return res.sendStatus( 400 );
        
      let lineItemsDeals = lineIds && lineIds.length > 0 && await asociateLineItemsWithDeal( accessToken, dealId, lineIds ).then( itemsDealResult =>
      {
        console.log( '=== Succesfully Associated Line Items To Deal from HubSpot using the access token ===' );
        console.log( 'Associate Line Items=====>', itemsDealResult )
        return itemsDealResult && itemsDealResult.results && itemsDealResult.results.length > 0 && itemsDealResult.results;
      } );
  
      if(!lineItemsDeals) return res.sendStatus( 400 );
          
      let updatedDeal = await UpdateDeal( accessToken,deal).then( resultUpdate =>
      { 
        console.log( '=== Succesfully Update Deal from HubSpot using the access token ===' );
        return resultUpdate && resultUpdate.id && resultUpdate || null;
      })
    
      // let quoteDeals = quoteId && await asociateQuotesWithDeal( accessToken, dealId, [ quoteId ] ).then( quoteDealResult =>
      // {
      //   console.log( '=== Succesfully Asociated Quote To Deal from HubSpot using the access token ===' );
      //   console.log( 'Associate Quote=====>', quoteDealResult )
      // } );
    if (!updatedDeal) return res.sendStatus( 400 );
  
  quotes.push( createQuoteObj(req.body.quote_name,req.body.quote_name,userEmail,contactEmail = 'yoanbell84@gmail.com', updatedDeal.properties.amount) );
  res.render( 'pages/quote_ok' );
    
} )

// app.put( '/quotes/:quoteId', async( req,res) =>
// {
//   if ( !isValid( req ) )
//     res.sendStatus( 403 )
//   else
//   { 
//     let objectId = req.params.quoteId;
//     quotes = [...quotes.filter( q => q.objectId != objectId ) ];
//     res.status( 200 ).send( { message: "Successfully deleted quote" } );  
//   }
  
// } );

app.delete( '/quotes/:quoteId', async( req,res) =>
{
  if ( !isValid( req ) )
    res.sendStatus( 403 )
  else
  { 
    let objectId = req.params.quoteId;
    quotes = [...quotes.filter( q => q.objectId != objectId ) ];
    res.status( 200 ).send( { message: "Successfully deleted quote" } );  
  }
  
} );

app.put( '/deals', async( req,res) =>
{
 
  if ( !isValid( req ) )
    res.sendStatus( 403 )
  else
  { 
  res.status( 200 ).send( { message: "Successfully Refreshed" } );  
  }
  
} );





app.post( '/webhook', ( req, res ) =>
{
  clientSecret = CLIENT_SECRET;
  httpMethod = 'POST';
  httpURI = config.hubspotWebhookUrl;
  requestBody = JSON.stringify(req.body);
  sourceString = clientSecret + requestBody;
  var requestSignature = req.headers[ 'x-hubspot-signature' ];
  
  if ( req.headers[ 'x-hubspot-signature-version' ] == 'v2' )
  sourceString = clientSecret + httpMethod + httpURI + requestBody;
  
  var hash = crypto.createHash( 'sha256' ).update( sourceString ).digest( 'hex' );
  
  if ( hash == requestSignature )
  { 
    console.log( '=== Retrieving WebHock ===' );
    console.log(req.body );
  }
  res.end();

} );


app.get( '/company-detail', function ( req, res )
{

  if ( !isValid( req ) )
    res.sendStatus( 403 )
  else
  { 
   
    let userId = req.query.userId;
    let userEmail = req.query.userEmail;
    let associatedObjectId = req.query.associatedObjectId;
    let associatedObjectType = req.query.associatedObjectType;
    let portalId = req.query.portalId;
    let companyCode = req.query.company_code;

    var options = {
      results: [
        {
          objectId: 26785,
          title: '1 Voice',
          // link: 'https://dev-ezcrm.easyworkforce.cloud/customers?company-code=46785',
          properties: [
            {
              label: "License Information",
              dataType: "STRING",
              value: "TimeLogix Software (TLH-SM) for 10 users"
            }, 
            {
              label: "License Status",
              dataType: "STATUS",
              value: "Active",
              optionType: "SUCCESS"
            },
            {
              label: "Expiration",
              dataType: "DATE",
              value: "2020-05-30"
              
            },
            {
              label: "Max Users",
              dataType: "NUMERIC",
              value: 10,
            },
            {
              label: "Monthly amount",
              dataType: "CURRENCY",
              currencyCode: "USD",
              value: 195,
            },
            {
              label: "Service Balance",
              dataType: "CURRENCY",
              currencyCode: "USD",
              value: 195,
            }
          ],
          actions: [
            {
              type: "IFRAME",
              width: 1500,
              height: 1500,
              uri: "https://dev-ezcrm.easyworkforce.cloud/customers?company-code="+companyCode,
              label: "more details"
            }
          ]
        }  
      ],
      // primaryAction: {
      //   type: "IFRAME",
      //   width: 1500,
      //   height: 1500,
      //   uri: httpURI,
      //   label: "Create CRM Quote"
      // }
    }
    return res.json(options);
  }
 
} );

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});


// This file is what handles incoming requests and
// serves files to the browser, or executes server-side code
