const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {log} = require("firebase-functions/logger");
const {getMessaging} = require("firebase-admin/messaging");
const {FieldValue} = require("firebase-admin/firestore");

admin.initializeApp(functions.config().firebase);

exports.sendInviteNotification = functions.firestore
    .document("users/{userId}")
    .onUpdate( async (change, context) => {
      const newValue = change.after.data();
      const oldValue = change.before.data();

      const oldInvites = oldValue.invitedCottageIDs;
      const newInvites = newValue.invitedCottageIDs;

      if (newInvites.length > oldInvites.length) {
        // get the firestore database
        const db = admin.firestore();

        // get the invited cottage id
        const invitedCottageId = newInvites
            .filter((x) => !oldInvites.includes(x))[0];

        let organizerRef;
        // get the cottage Information
        await db.collection("cottages")
            .doc(invitedCottageId).get().then((cottageSnapshot) => {
              const cottageData = cottageSnapshot.data();
              organizerRef = cottageData.organizer;
            });

        let organizerName;
        await organizerRef.get().then((organizerSnapshot) => {
          const organizerData = organizerSnapshot.data();
          organizerName = organizerData.fullName;
        });

        // retrieve the tokens in the user document's 'fcmTokens' collection
        const retrievedTokens = [];
        await db.collection("users")
            .doc(context.params.userId)
            .collection("fcmTokens").get().then((snapshot) => {
              snapshot.forEach((doc) => {
                const newElement = {
                  "fcmToken": doc.id,
                  "lastRefresh": doc.data().lastRefresh,
                  "cottageInvitesEnabled": doc.data().cottageInvitesEnabled,
                };
                if (newElement.cottageInvitesEnabled) {
                  retrievedTokens.push(newElement);
                }
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

        // send the email by adding it to emails collections
        let userEmail;
        await db.collection("users")
            .doc(context.params.userId).get().then((userSnapshot) => {
              const userData = userSnapshot.data();
              userEmail = userData.email;
            });

        const emailToSend = {
          subject: "You Have Received a Cottage Invite!",
          html: `${organizerName} has invited you to a cottage!`,
        };

        await db.collection("emails")
            .doc().set({
              to: userEmail,
              message: emailToSend,
            });
      }
    });

exports.sendEmailToUnregisteredAddress = functions.firestore
    .document("uncreated/{emailAddress}")
    .onWrite( async (change, context) => {
      // Exit when the data is deleted.
      if (!change.after.exists) {
        return null;
      }

      const newValue = change.after.data();
      const oldValue = change.before.data();

      const newInvites = newValue.pendingInvites;

      let oldInvites = [];
      if (oldValue === undefined || oldValue === null) {
        // do nothing
      } else {
        oldInvites = oldValue.pendingInvites;
      }

      if (newInvites.length > oldInvites.length) {
        // get the firestore database
        const db = admin.firestore();

        // get the invited cottage id
        const invitedCottageId = newInvites
            .filter((x) => !oldInvites.includes(x))[0];
        log(invitedCottageId);

        let organizerRef;
        // get the cottage Information
        await db.collection("cottages")
            .doc(invitedCottageId).get().then((cottageSnapshot) => {
              const cottageData = cottageSnapshot.data();
              organizerRef = cottageData.organizer;
            });

        let organizerName;
        await organizerRef.get().then((organizerSnapshot) => {
          const organizerData = organizerSnapshot.data();
          organizerName = organizerData.fullName;
        });
        log(organizerName);

        const emailAddress = context.params.emailAddress;
        log(emailAddress);

        const emailToSend = {
          subject: "You Have Received a Cottage Invite!",
          html: `${organizerName} has invited you to a cottage!`,
        };

        await db.collection("emails")
            .doc().set({
              to: emailAddress,
              message: emailToSend,
            });
      }
    });

exports.deleteUserDocument = functions.auth.user().onDelete( async (user) => {
  const userIdToDelete = user.uid;

  const db = admin.firestore();

  await db.collection("users")
      .doc(userIdToDelete)
      .collection("fcmTokens")
      .get().then((snapshot) => {
        snapshot.forEach((doc) => {
          doc.ref.delete();
        });
      }).catch((reason) => {
        log(reason);
      });

  await db.collection("users")
      .doc(userIdToDelete)
      .delete();
});

exports.didDeleteCottage = functions.firestore
    .document("cottages/{cottageId}")
    .onDelete( async (snap, context) => {
      const db = admin.firestore();

      const deletedValue = snap.data();
      const invitedEmails = deletedValue.invitedEmails;
      const cottageId = context.params.cottageId;

      for (const email of invitedEmails) {
        const userDocQuery = db.collection("users").where("email", "==", email);

        userDocQuery.get()
            .then((querySnapshot) => {
              if (!querySnapshot.empty) {
                querySnapshot.docs[0].ref.update(
                    "invitedCottageIDs", FieldValue.arrayRemove(cottageId),
                );
              } else {
                db.collection("uncreated").doc(email).update(
                    "pendingInvites", FieldValue.arrayRemove(cottageId),
                );
              }
            }).catch((reason) => {
              log(reason);
            });
      }
    });
