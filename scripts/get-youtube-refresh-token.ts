#!/usr/bin/env ts-node#!/usr/bin/env ts-node#!/usr/bin/env ts-node

/**

 * YouTube OAuth 2.0 Setup Script/**/**

 * Generates a refresh token for posting videos to YouTube

 *  * YouTube OAuth 2.0 Setup Script * YouTube OAuth 2.0 Setup Script

 * Prerequisites:

 * 1. Set YT_CLIENT_ID and YT_CLIENT_SECRET in your .env file * Generates a refresh token for posting videos to YouTube * Generates a refresh token for posting videos to YouTube

 * 2. Run: npx ts-node scripts/get-youtube-refresh-token.ts

 */ *  * 



import * as readline from 'readline'; * Prerequisites: * Run: npx ts-node scripts/get-youtube-refresh-token.ts

import axios from 'axios';

 * 1. Set YT_CLIENT_ID and YT_CLIENT_SECRET in your .env file */

// Read from environment variables - NEVER hardcode secrets

const CLIENT_ID = process.env.YT_CLIENT_ID; * 2. Run: npx ts-node scripts/get-youtube-refresh-token.ts

const CLIENT_SECRET = process.env.YT_CLIENT_SECRET;

const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; * import * as readline from 'readline';



if (!CLIENT_ID || !CLIENT_SECRET) { * This script will:import axios from 'axios';

  console.error('Error: YT_CLIENT_ID and YT_CLIENT_SECRET must be set in .env');

  process.exit(1); * - Generate an authorization URL

}

 * - Wait for you to authorize and paste the codeconst CLIENT_ID = process.env.YT_CLIENT_ID || '';

const SCOPES = [

  'https://www.googleapis.com/auth/youtube.upload', * - Exchange the code for a refresh tokenconst CLIENT_SECRET = process.env.YT_CLIENT_SECRET || '';

  'https://www.googleapis.com/auth/youtube',

  'https://www.googleapis.com/auth/youtube.force-ssl' * - Display the refresh token to add to your .envconst REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // Use out-of-band flow

].join(' ');

 */

async function main() {

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');if (!CLIENT_ID || !CLIENT_SECRET) {

  authUrl.searchParams.set('client_id', CLIENT_ID);

  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);import * as readline from 'readline';  console.error('Error: YT_CLIENT_ID and YT_CLIENT_SECRET must be set in environment variables');

  authUrl.searchParams.set('response_type', 'code');

  authUrl.searchParams.set('scope', SCOPES);import axios from 'axios';  process.exit(1);

  authUrl.searchParams.set('access_type', 'offline');

  authUrl.searchParams.set('prompt', 'consent');}



  console.log('Visit this URL:\n');// Read from environment variables - NEVER hardcode secrets

  console.log(authUrl.toString());

  console.log('\n');const CLIENT_ID = process.env.YT_CLIENT_ID;// Scopes needed for uploading videos



  const rl = readline.createInterface({const CLIENT_SECRET = process.env.YT_CLIENT_SECRET;const SCOPES = [

    input: process.stdin,

    output: process.stdoutconst REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // Use out-of-band flow  'https://www.googleapis.com/auth/youtube.upload',

  });

  'https://www.googleapis.com/auth/youtube',

  const authCode = await new Promise<string>((resolve) => {

    rl.question('Paste the authorization code: ', (answer) => {// Validate required environment variables  'https://www.googleapis.com/auth/youtube.force-ssl'

      rl.close();

      resolve(answer.trim());if (!CLIENT_ID || !CLIENT_SECRET) {].join(' ');

    });

  });  console.error('❌ Error: Required environment variables not set\n');



  const response = await axios.post('https://oauth2.googleapis.com/token', {  console.error('Please set the following in your .env file:');async function main() {

    code: authCode,

    client_id: CLIENT_ID,  console.error('  YT_CLIENT_ID=your-client-id');  console.log('\n=== YouTube OAuth Setup ===\n');

    client_secret: CLIENT_SECRET,

    redirect_uri: REDIRECT_URI,  console.error('  YT_CLIENT_SECRET=your-client-secret\n');  console.log('This script will help you get a refresh token for posting videos to YouTube.\n');

    grant_type: 'authorization_code'

  });  console.error('Get these from: https://console.cloud.google.com/apis/credentials');



  console.log('\nAdd to .env:\n');  process.exit(1);  // Step 1: Generate authorization URL

  console.log(`YT_REFRESH_TOKEN=${response.data.refresh_token}`);

}}  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');



main().catch(console.error);  authUrl.searchParams.set('client_id', CLIENT_ID);


// Scopes needed for uploading videos  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);

const SCOPES = [  authUrl.searchParams.set('response_type', 'code');

  'https://www.googleapis.com/auth/youtube.upload',  authUrl.searchParams.set('scope', SCOPES);

  'https://www.googleapis.com/auth/youtube',  authUrl.searchParams.set('access_type', 'offline');

  'https://www.googleapis.com/auth/youtube.force-ssl'  authUrl.searchParams.set('prompt', 'consent');

].join(' ');

  console.log('Step 1: Visit this URL to authorize your YouTube channel:\n');

async function main() {  console.log(authUrl.toString());

  console.log('\n=== YouTube OAuth Setup ===\n');  console.log('\n');

  console.log('This script will help you get a refresh token for posting videos to YouTube.\n');

  // Step 2: Get authorization code from user

  // Step 1: Generate authorization URL  const rl = readline.createInterface({

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');    input: process.stdin,

  authUrl.searchParams.set('client_id', CLIENT_ID);    output: process.stdout

  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);  });

  authUrl.searchParams.set('response_type', 'code');

  authUrl.searchParams.set('scope', SCOPES);  const authCode = await new Promise<string>((resolve) => {

  authUrl.searchParams.set('access_type', 'offline');    rl.question('Step 2: After authorizing, Google will show you an authorization code. Paste it here:\n', (answer) => {

  authUrl.searchParams.set('prompt', 'consent');      rl.close();

      resolve(answer.trim());

  console.log('Step 1: Visit this URL to authorize the application:\n');    });

  console.log(authUrl.toString());  });

  console.log('\n');

  console.log('\nStep 3: Exchanging authorization code for tokens...\n');

  // Step 2: Get authorization code from user

  const rl = readline.createInterface({  // Step 3: Exchange authorization code for tokens

    input: process.stdin,  try {

    output: process.stdout    const response = await axios.post('https://oauth2.googleapis.com/token', {

  });      code: authCode,

      client_id: CLIENT_ID,

  const authCode = await new Promise<string>((resolve) => {      client_secret: CLIENT_SECRET,

    rl.question('Step 2: Paste the authorization code here: ', (answer) => {      redirect_uri: REDIRECT_URI,

      rl.close();      grant_type: 'authorization_code'

      resolve(answer.trim());    });

    });

  });    const { access_token, refresh_token, expires_in } = response.data;



  if (!authCode) {    if (!refresh_token) {

    console.error('❌ No authorization code provided');      console.error('\n❌ Error: No refresh token received.');

    process.exit(1);      console.error('This might happen if you\'ve already authorized this app before.');

  }      console.error('Try revoking access at: https://myaccount.google.com/permissions');

      console.error('Then run this script again.\n');

  // Step 3: Exchange code for tokens      process.exit(1);

  console.log('\nStep 3: Exchanging code for tokens...\n');    }



  try {    console.log('✅ Success! Here are your tokens:\n');

    const response = await axios.post('https://oauth2.googleapis.com/token', {    console.log('Access Token:', access_token);

      code: authCode,    console.log('Refresh Token:', refresh_token);

      client_id: CLIENT_ID,    console.log('Expires In:', expires_in, 'seconds\n');

      client_secret: CLIENT_SECRET,

      redirect_uri: REDIRECT_URI,    console.log('=== Next Steps ===\n');

      grant_type: 'authorization_code'    console.log('1. Add this to your .env file:');

    });    console.log(`   YT_REFRESH_TOKEN=${refresh_token}\n`);

    console.log('2. Add to Google Cloud Secret Manager:');

    const { access_token, refresh_token, expires_in } = response.data;    console.log(`   echo -n "${refresh_token}" | gcloud secrets versions add YT_REFRESH_TOKEN --data-file=-\n`);

    console.log('3. Your automation is now ready to post to YouTube!\n');

    console.log('✅ Success! Tokens received:\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');  } catch (error: any) {

    console.log('\nAdd this to your .env file:\n');    console.error('\n❌ Error exchanging authorization code:');

    console.log(`YT_REFRESH_TOKEN=${refresh_token}`);    if (error.response) {

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');      console.error('Status:', error.response.status);

    console.log(`Access Token (expires in ${expires_in}s):`);      console.error('Data:', JSON.stringify(error.response.data, null, 2));

    console.log(access_token);    } else {

    console.log('\n✅ Setup complete! You can now post videos to YouTube.');      console.error(error.message);

    }

  } catch (error: any) {    process.exit(1);

    console.error('❌ Error exchanging code for tokens:');  }

    if (error.response) {}

      console.error(error.response.data);

    } else {main().catch(console.error);

      console.error(error.message);
    }
    process.exit(1);
  }
}

main().catch(console.error);
