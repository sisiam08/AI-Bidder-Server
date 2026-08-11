

export function buildJobUrl(platform: string, externalJobId: string): string {
  switch (platform) {
    case 'upwork': {
      const id = externalJobId.match(/~([a-f0-9]+)/)?.[1] ?? externalJobId;
      return `https://www.upwork.com/jobs/${id}`;
    }
    case 'freelancer':
      return externalJobId.startsWith('/')
        ? `https://www.freelancer.com${externalJobId}`
        : `https://www.freelancer.com/projects/${externalJobId}`;
    default:
      return '';
  }
}
