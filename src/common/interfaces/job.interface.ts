export interface ExtractedJob {
  platform: 'upwork' | 'freelancer' | 'guru' | 'peopleperhour';
  externalJobId: string;
  title: string;
  description: string;
  budget: {
    type: 'fixed' | 'hourly';
    min?: number;
    max?: number;
    currency: string;
  };
  skills: string[];
  clientInfo: { name?: string; rating?: number; totalSpent?: number };
  country: string;
  experienceLevel: string;
  attachments: string[];
  postedAt: string;
}

export interface JobAnalysisInput {
  title: string;
  description: string;
  budget: { type: string; min?: number; max?: number; currency: string };
  skills: string[];
  clientInfo: { rating?: number; totalSpent?: number };
}

export interface ProviderCredentials {
  apiKey?: string;
}

export interface JobAnalysisOutput {
  summary: string;
  requiredSkills: string[];
  suggestedProposal: string;
  suggestedBudget: { amount: number; currency: string };
  suggestedTimeline?: string;
  questions?: string[];
  portfolioLink?: string;
}

export interface JobNotification {
  jobId: string;
  platform: string;
  title: string;
  jobUrl: string;
  budget: {
    type?: string;
    min?: number;
    max?: number;
    currency?: string;
  };
  aiSummary: string;
  skills: string[];
  suggestedProposal: string;
  suggestedBudget?: { amount: number; currency: string };
  suggestedTimeline?: string;
}

export interface DeliveryReceipt {
  success: boolean;
  messageId?: string;
  error?: string;
  

  isConfigurationError?: boolean;
}

export interface ApprovalCallback {
  jobId: string;
  action: 'approve' | 'reject';
  channel: string;
}

export interface BlockedBidNotification {
  jobId: string;
  platform: string;
  title: string;
  jobUrl: string;
  reasons: string[];
}
