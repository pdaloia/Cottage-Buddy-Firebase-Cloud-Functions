const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {log} = require("firebase-functions/logger");
const {getMessaging} = require("firebase-admin/messaging");

admin.initializeApp(functions.config().firebase);

exports.sendInviteNotification = functions.firestore
    .document("users/{userId}")
    .onUpdate( async (change, context) => {
      const newValue = change.after.data();
      const oldValue = change.before.data();

      const oldInvites = oldValue.invitedCottageIDs;
      const newInvites = newValue.invitedCottageIDs;

      if (newInvites.length > oldInvites.length) {
        // retrieve the tokens in the user document's 'fcmTokens' collection
        const db = admin.firestore();
        const retrievedTokens = [];
        await db.collection("users")
            .doc(context.params.userId)
            .collection("fcmTokens").get().then((snapshot) => {
              snapshot.forEach((doc) => {
                const newElement = {
                  "fcmToken": doc.id,
                  "lastRefresh": doc.data().lastRefresh,
                };
                retrievedTokens.push(newElement);
              });
            }).catch((reason) => {
              log(reason);
            });

        // create the notification
        const notification = {
          body: "You received an invite!",
        };

        const apns = {
          payload: {
            aps: {
              badge: 1,
              sound: "default",
            },
          },
        };

        // send the notification to the tokens
        const messages = [];
        retrievedTokens.forEach((token) => {
          messages.push({
            token: token.fcmToken,
            notification: notification,
            apns: apns,
          });
        });

        const messaging = getMessaging();
        const batchResponse = await messaging.sendEach(messages);
        if (batchResponse.failureCount < 1) {
          // Messages sent sucessfully. We're done!
        }
      }
    });
