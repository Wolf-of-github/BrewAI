const { Firestore } = require("@google-cloud/firestore");

const firestore = new Firestore();

const listTailored = async (req, res) => {
  const userId = req.user.user_id;
  try {
    const snapshot = await firestore
      .collection("drafts")
      .where("userId", "==", userId)
      .get();

    const jobs = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        job_id: doc.id,
        company: data.company ?? 'Company',
        role: data.role ?? 'Role',
        jd: data.jd ?? '',
        timestamp: data.createdAt?.toDate?.()?.toISOString() ?? '',
        status: data.status === 'completed' ? 'done' : data.status === 'failed' ? 'failed' : 'processing',
        gcs_url: '',
        source_file_id: '',
        instructions: data.instructions ?? [],
      };
    });

    return res.status(200).json({ jobs });
  } catch (err) {
    console.error(`[listTailored] FAILED — ${err.message}`);
    return res.status(500).json({ error: "Internal error" });
  }
};

module.exports = { listTailored };
