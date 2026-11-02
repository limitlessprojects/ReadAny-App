export type {
  DeviceInfo,
  FeedbackComment,
  FeedbackDetail,
  FeedbackRecord,
  FeedbackStatusItem,
  FeedbackSubmission,
  FeedbackSubmitResult,
  FeedbackType,
} from "./feedback-types";

export {
  appendLog,
  appendStructuredLog,
  clearLogs,
  collectDeviceInfo,
  collectLogs,
  getFeedbackDetail,
  getFeedbackHistory,
  getRemainingSubmissions,
  getUnreadFeedbackCount,
  installFeedbackLogCapture,
  markFeedbackReplySeen,
  refreshAndCountUnreadFeedback,
  refreshFeedbackStatus,
  setFeedbackWorkerUrl,
  submitFeedback,
} from "./feedback-service";
