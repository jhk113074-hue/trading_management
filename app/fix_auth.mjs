import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialize Admin SDK
const serviceAccount = JSON.parse(readFileSync('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function fixAuth() {
  try {
    // 1. Delete new duplicate accounts to prevent email conflicts
    const duplicates = [
      'fh53CfGA5kbAgGLsM8sAX57LJmQ2', // new jhkim1130
      'slsOixAdPRSzn8kfvNgGPWPKoVq2'  // new admin
    ];
    for (const uid of duplicates) {
      try {
        await admin.auth().deleteUser(uid);
        console.log(`Deleted duplicate user ${uid}`);
      } catch (err) {
        console.log(`User ${uid} already deleted or error:`, err.message);
      }
    }

    // 2. Set default password for the original imported accounts
    const oldUsers = [
      '2gbMXPxBSdc1bhoa3cZ47bIV7eV2', // alexpark
      '3RtQuXQo2zQPXTTiTCRjMz4PSS22', // jhk010624
      '49Y7G6mhSghtCngZlPzpYIzdDyU2', // jhkim1130 (old)
      'NhaR6TpP4zfJYX8p2QsrEZPUfV03'  // admin (old)
    ];

    for (const uid of oldUsers) {
      try {
        await admin.auth().updateUser(uid, {
          password: 'ysacc1234!'
        });
        console.log(`Successfully reset password for old user ${uid}`);
      } catch (err) {
        console.log(`Error updating user ${uid}:`, err.message);
      }
    }
    
    console.log("Auth fix complete!");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

fixAuth();
