const { Firestore } = require("@google-cloud/firestore");

const firestore = new Firestore();

const getGithubStatus = async (req, res) => {
  const userId = req.user.user_id;
  try {
    const readmeDoc = await firestore.collection("githubReadmes").doc(userId).get();

    if (!readmeDoc.exists) {
      return res.status(200).json({ github_id: null, status: null, repos_found: null });
    }

    const { githubId = null, status = null, reposFound = null } = readmeDoc.data();
    return res.status(200).json({ github_id: githubId, status, repos_found: reposFound });
  } catch (err) {
    console.error(`[getGithubStatus] FAILED — ${err.message}`);
    return res.status(500).json({ error: "Internal error" });
  }
};

module.exports = { getGithubStatus };
