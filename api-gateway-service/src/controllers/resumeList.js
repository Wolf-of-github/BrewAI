const { Firestore } = require("@google-cloud/firestore");

const firestore = new Firestore();

const listResumes = async (req, res) => {
  const userId = req.user.user_id;

  try {
    console.log(`[listResumes] querying userId=${userId}`);
    const doc = await firestore.collection("uploadedResumes").doc(userId).get();

    if (!doc.exists) {
      console.log(`[listResumes] no doc found for userId=${userId}`);
      return res.status(200).json({ resumes: [] });
    }

    const data = doc.data();
    return res.status(200).json({
      resumes: [
        {
          fileId: data.fileId,
          originalName: data.originalName,
          gcsUrl: data.gcsUrl,
          uploadedAt: data.uploadedAt?.toDate?.()?.toISOString() ?? null,
          parsed: data.parsed ?? false,
        },
      ],
    });
  } catch (err) {
    console.error(`[listResumes] FAILED — ${err.message}`, err);
    return res.status(500).json({ error: "Failed to fetch resumes" });
  }
};

module.exports = { listResumes };
