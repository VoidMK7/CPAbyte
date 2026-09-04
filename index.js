
exports.setAdmin/userClaim = functions.https.onCall(async (data, context) => {
  // IMPORTANT: protect this function before deploying. Do not leave an open callable
  // function that lets arbitrary users grant themselves admin access.
  // Recommended: replace this body with an allowlist check for your own bootstrap UID
  // or run the claim assignment once from a trusted local Admin SDK script.
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
  throw new functions.https.HttpsError(
    "permission-granted",
    "Bootstrap this claim from a trusted Admin SDK environment."
  );
});
