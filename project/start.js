var express = require( 'express' );
const NodeCache = require('node-cache');
const session = require( 'express-session' );
const request = require( 'request-promise-native' );
const redis = require( 'redis' );
var app = express();
app.use(express.json());       // to support JSON-encoded bodies
app.use( express.urlencoded({ extended: true }) ); // to support URL-encoded bodies

const crypto = require( 'crypto' );
const config = require('../config');
const PORT = (process.env.PORT || 5000);

const refreshTokenStore = {};
const accessTokenCache = new NodeCache( { deleteOnExpire: true } );

const productList = [
  {
      hs_product_id: 101043994,
      quantity: 3,
      price: 749.99,
      name: 'Xenio-50'
   
  }, {
   
      hs_product_id: 101043992,
      quantity: 3,
      price: 20,
      name: 'RFID -10C'
   
  }
]

if (!config.clientId || !config.clientSecret) {
    throw new Error('Missing CLIENT_ID or CLIENT_SECRET environment variable.')
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
const CLIENT_ID = config.clientId;
const CLIENT_SECRET = config.clientSecret;


// Scopes for this app will default to `contacts`
// To request others, set the SCOPE environment variable instead
let SCOPES = ['contacts'];
if (config.scope) {
    SCOPES = (config.scope.split(/ |, ?|%20/)).join(' ');
}

// On successful install, users will be redirected to /oauth-callback
const REDIRECT_URI = config.nodeMode == 'DEBUG' ? `http://localhost:${ PORT }/oauth-callback` : 'https://enigmatic-tor-68993.herokuapp.com/oauth-callback';



//===========================================================================//

// Use a session to keep track of client ID
app.use(session({
  secret: Math.random().toString(36).substring(2),
  resave: false,
  saveUninitialized: true
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
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`; // where to send the user after the consent page

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
    const tokens = JSON.parse(responseBody);
    refreshTokenStore[userId] = tokens.refresh_token;
    accessTokenCache.set(userId, tokens.access_token, Math.round(tokens.expires_in * 0.75));

    console.log('       > Received an access token and refresh token');
    return tokens.access_token;
  } catch (e) {
    console.error(`       > Error exchanging ${exchangeProof.grant_type} for access token`);
    return JSON.parse(e.response.body);
  }
};

const refreshAccessToken = async (userId) => {
  const refreshTokenProof = {
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    refresh_token: refreshTokenStore[userId]
  };
  return await exchangeForTokens(userId, refreshTokenProof);
};

const getAccessToken =  async (userId) => {
  // If the access token has expired, retrieve
  // a new one using the refresh token
  if (!accessTokenCache.get(userId)) {
    console.log('Refreshing expired access token');
    await refreshAccessToken(userId);
  }
  return accessTokenCache.get(userId);
};

const isAuthorized = (userId) => {
  return refreshTokenStore[userId] ? true : false;
};


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

app.set('port', PORT);

app.use(express.static(__dirname));

// views is directory for all template files
app.set('views', __dirname + '/html');
app.set('view engine', 'ejs');

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


app.get( '/new-quote', ( req, res ) => 
{

  // console.log('Request Query----------', req.query)
  res.render( 'pages/quote', {dealId: req.query.dealId});
 
} );


//====================================================//
//   Update a deal                                    //
//====================================================//


const UpdateDeal = async ( accessToken,dealId, finalAmout = 0) =>
{
  console.log( '' );
  console.log( `=== Update Deal ${dealId} from HubSpot using the access token ===` );
  console.log( '===> request.post(\'https://api.hubapi.com/crm/v3/objects/deals/:dealId\')' );

  const amount = productList.map( prod => prod.quantity * prod.amount ).reduce( ( a, b ) => ( a || 0 ) + ( b || 0 ) );
  var options = {
    url: `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
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
      amount: amount,
      hs_acv: amount,
      hs_tcv: amount,
      assigned_channel: 1,
      tax: 150,
      shipping: 130,
      max_users: 50,
      dealstage: 'qualifiedtobuy'

    },
    json: true
  }

  const result = await request( options ).then( result => result ).catch( err => console.log(err) );
 
  return result;
};
app.post( '/create-quote', async (req,res) => {
 
    let dealId = req.body.dealId;
    let lineIds, quoteId = null;
    const accessToken = await getAccessToken( req.sessionID );

    // quoteId = await createQuote( accessToken ).then( qResult =>
    // { 
    //   console.log( '=== Succesfully Created Quote from HubSpot using the access token ===' );
    //   console.log( 'Quote =====>', JSON.stringify(qResult, null , 2) )
    //     return qResult && qResult.id;
    // } );
  
    
      lineIds = await createLineItems( accessToken ).then( itemsResult =>
      {
        console.log( '=== Succesfully Created Line Items  from HubSpot using the access token ===' );
        console.log( 'Line Items=====>', itemsResult && itemsResult.results && itemsResult.results.length > 0 && itemsResult.results.map( r => r.id ))
        return itemsResult && itemsResult.results && itemsResult.results.length > 0 && itemsResult.results.map( r => r.id );
      } );
  
      if(!lineIds) return res.sendStatus( 400 );
        
      let lineItemsDeals = lineIds && lineIds.length > 0 && await asociateLineItemsWithDeal( accessToken, dealId, lineIds ).then( itemsDealResult =>
      {
        console.log( '=== Succesfully Asociated Line Items To Deal from HubSpot using the access token ===' );
        console.log( 'Associate Line Items=====>', itemsDealResult )
        return itemsDealResult && itemsDealResult.results && itemsDealResult.results.length > 0 && itemsDealResult.results;
      } );
  
      if(!lineItemsDeals) return res.sendStatus( 400 );
          
      let updatedDeal = await UpdateDeal( accessToken,dealId, 5000 ).then( resultUpdate =>
      { 
        console.log( '=== Succesfully Update Deal from HubSpot using the access token ===' );
        return resultUpdate && resultUpdate.Id || 0;
      })
    
      // let quoteDeals = quoteId && await asociateQuotesWithDeal( accessToken, dealId, [ quoteId ] ).then( quoteDealResult =>
      // {
      //   console.log( '=== Succesfully Asociated Quote To Deal from HubSpot using the access token ===' );
      //   console.log( 'Associate Quote=====>', quoteDealResult )
      // } );
      if(updatedDeal == 0 ) return res.sendStatus( 400 );
      res.sendStatus( 200 );
    
})


app.post( '/webhock', ( req, res ) =>
{
  clientSecret = process.env.CLIENT_SECRET;
  httpMethod = 'POST';
  httpURI = process.env.webhock_url;
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


const isValid = (req) =>
{

  let result = true; 
  if ( !req.headers[ 'x-hubspot-signature' ] ) result = false;
  else if ( req.headers[ 'x-hubspot-signature' ] )
  { 
    var requestSignature = req.headers[ 'x-hubspot-signature' ];
    let clientSecret = process.env.CLIENT_SECRET;
    let httpMethod = req.method;
    let httpURI = req.headers['x-forwarded-proto'] + '://' + req.headers.host + req.url;
   
    let sourceString = clientSecret + httpMethod + httpURI;
    let hash = crypto.createHash( 'sha256' ).update( sourceString ).digest( 'hex' );
   
    if ( hash !== requestSignature )
      result = false;
  }
  return result
}

app.get( '/quote', function ( req, res )
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

    let iframeHttpURI = `https://enigmatic-tor-68993.herokuapp.com/new-quote?dealId=${associatedObjectId}`;
    
    
    var options = {
      results: [
        {
          quote_name: "Sample Yoan-quote",
          objectId: 232,
          title: 'Test-Yoan',
          link: 'https://enigmatic-tor-68993.herokuapp.com/test-yoan',
          properties: [
            {
              label: "Seller",
              dataType: "EMAIL",
              value: "ybell@easyworkforce.com"
            },
            {
              label: "Amount",
              dataType: "CURRENCY",
              value: "150",
              currencyCode: "USD"
            }
          ],
          actions: [
            {
              type: "IFRAME",
              width: 1500,
              height: 1500,
              uri: "https://tools.hubteam.com/integrations-iframe-test-app",
              label: "Edit"
            },
            {
              type: "CONFIRMATION_ACTION_HOOK",
              confirmationMessage: "Are you sure you want to delete this quote",
              confirmButtonText: "Yes",
              cancelButtonText: "No",
              httpMethod: "DELETE",
              uri: "https://api.hubapi.com/linked-sales-objects-test-application/v1/actions/demo-ticket/988",
              label: "Delete"
            }
          ]
        }
      ],
      primaryAction: {
        type: "IFRAME",
        width: 1500,
        height: 1500,
        uri: iframeHttpURI,
        label: "Create CRM Quote"
      }
    }
    return res.json( options );
  }
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



const getExistingObjectDealById = async ( id = 100777 ) => { 
  try
  { 
    const headers = {
      // Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    console.log('===> request.get(\'https://api.hubapi.com/extensions/sales-objects/v1/object-types/\')');
    const result = await request.get('https://api.hubapi.com/extensions/sales-objects/v1/object-types/'+id+'?hapikey='+config.devApiKey, {
      headers: headers,      
    } );
    console.log('Getting deal info' , JSON.stringify(result, null,2))
    return result
  } catch (e) {
    console.error( '  > Unable to retrieve deal ===>',e.message );
    process.exit( 0 );
    // return JSON.parse(e.response.body);
  }
} 

app.get( '/deal-type', async ( req, res ) => 
{ 
  const objects = await getExistingObjectDealById();
    res.type('application/json')
    // res.write( `<a href="/"><h3>Back</h3></a>` );
    // res.write( `<div id='content'>${JSON.parse(objects)}</div>` );
   res.send(objects)
   
  
})

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});


// This file is what handles incoming requests and
// serves files to the browser, or executes server-side code
