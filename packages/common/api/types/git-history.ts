interface GitHistoryRow {
    sha: string;
    timestamp: number;
}

interface GitHistory {
    sha: string;
    timestamp: string;
}

export type { GitHistory, GitHistoryRow };
