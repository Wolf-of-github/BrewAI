const express = require("express");
const multer = require("multer");
const { health } = require("./controllers/gatewayController");
const { authenticate } = require("./middleware/auth");
const { uploadResume } = require("./controllers/resumeUpload");
const { listResumes } = require("./controllers/resumeList");
const { uploadGithubId } = require("./controllers/githubUpload");
const { getGithubStatus } = require("./controllers/githubStatus");
const { disconnectGithub } = require("./controllers/githubDisconnect");
const { tailorResume } = require("./controllers/resumeTailor");
const { listTailored } = require("./controllers/tailoredList");
const { getTailoredContent, getTailoredTex } = require("./controllers/tailoredContent");
const { deleteResume } = require("./controllers/resumeDelete");
const { getGithubOAuthUrl, handleGithubOAuthCallback } = require("./controllers/githubOAuth");
const { updateTailoredJob } = require("./controllers/resumeTailorUpdate");
const { getBillingStatus, recordDownload, recordJD, simulateUpgrade, simulateDowngrade, createCheckoutSession, createPortalSession, handleWebhook, redeemPromo } = require("./controllers/billing");
const { sendContactEmail } = require("./controllers/contact");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Unsupported file type'), { status: 415 }));
  },
});

router.get("/health", health);
router.get("/resume/list", authenticate, listResumes);
router.post("/resume/upload", authenticate, (req, res, next) => {
  upload.single("resume")(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    if (err.status === 415) {
      return res.status(415).json({ error: 'Unsupported file type. Please upload a PDF or DOCX.' });
    }
    return res.status(400).json({ error: err.message || 'Upload error.' });
  });
}, uploadResume);
router.delete("/resume/delete", authenticate, deleteResume);
router.get("/github-id/status", authenticate, getGithubStatus);
router.post("/github-id/upload", authenticate, uploadGithubId);
router.delete("/github/disconnect", authenticate, disconnectGithub);
router.post("/resume/tailor", authenticate, tailorResume);
router.get("/resume/tailored/list", authenticate, listTailored);
router.get("/resume/tailored/:job_id/content", authenticate, getTailoredContent);
router.get("/resume/tailored/:job_id/tex", authenticate, getTailoredTex);
router.patch("/resume/tailored/:job_id", authenticate, updateTailoredJob);
router.get("/github/oauth/url", getGithubOAuthUrl);
router.post("/github/oauth/callback", authenticate, handleGithubOAuthCallback);

router.get("/billing/status", authenticate, getBillingStatus);
router.post("/billing/record-download", authenticate, recordDownload);
router.post("/billing/record-jd", authenticate, recordJD);
router.post("/billing/simulate-upgrade", authenticate, simulateUpgrade);
router.post("/billing/simulate-downgrade", authenticate, simulateDowngrade);
router.post("/billing/checkout", authenticate, createCheckoutSession);
router.post("/billing/portal", authenticate, createPortalSession);
router.post("/billing/redeem-promo", authenticate, redeemPromo);
router.post("/billing/webhook", handleWebhook);  // no auth — verified by Stripe signature

router.post("/contact", sendContactEmail);  // no auth — public contact form

module.exports = router;
