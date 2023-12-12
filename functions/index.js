const functions = require("firebase-functions");
const {log} = require("firebase-functions/logger");

exports.sendInviteNotification = functions.firestore
    .document("users/{docId}")
    .onUpdate((change, context) => {
      log("Starting function 3");

      const newValue = change.after.data();
      const oldValue = change.before.data();

      const oldInvites = oldValue.invitedCottageIDs;
      const newInvites = newValue.invitedCottageIDs;
      log(oldInvites);
      log(newInvites);

      if (newInvites.length > oldInvites.length) {
        log("Invite added, should send notification");
      }

      log("Ending function 3");
    });
