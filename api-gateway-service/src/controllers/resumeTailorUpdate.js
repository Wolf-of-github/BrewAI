const { Firestore } = require("@google-cloud/firestore");

const firestore = new Firestore();

const updateTailoredJob = async (req, res) => {
  const userId = req.user.user_id;
  const { job_id } = req.params;
  const { company, role } = req.body;

  if (!company && !role) {
    return res.status(400).json({ error: "At least one of company or role is required" });
  }

  const update = {};
  if (company) update.company = company;
  if (role) update.role = role;

  try {
    const ref = firestore.collection("drafts").doc(job_id);

    const doc = await ref.get();
    if (!doc.exists || doc.data().userId !== userId) {
      return res.status(404).json({ error: "Job not found" });
    }

    await ref.update(update);
    console.log(`[updateTailoredJob] userId=${userId} draftId=${job_id} updated`, update);
    return res.status(200).json({ ack: true });
  } catch (err) {
    console.error(`[updateTailoredJob] FAILED — ${err.message}`);
    return res.status(500).json({ error: "Internal error" });
  }
};

module.exports = { updateTailoredJob };
