var express = require('express');
var app = express();

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname));

// views is directory for all template files
app.set('views', __dirname + '/html');
app.set('view engine', 'ejs');

app.get('/', function(request, response) {
  response.render('pages/index');
});


app.get( '/quote', function ( request, response )
{
  var options = {
    results: [],
    settingsAction: {
      type: "IFRAME",
      width: 890,
      height: 748,
      uri: "https://example.com/settings-iframe-contents",
      label: "Settings"
    },
    primaryAction: {
      type: "IFRAME",
      width: 890,
      height: 748,
      uri: "https://example.com/create-iframe-contents",
      label: "Create Quote"
    }
  }
  return response.json(options);
});



app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});


// This file is what handles incoming requests and
// serves files to the browser, or executes server-side code
