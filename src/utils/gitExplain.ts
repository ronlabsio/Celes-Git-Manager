export interface GitOperationExplanation {
  title: string;
  description: string;
  command: string;
}

export const gitExplanations: Record<string, GitOperationExplanation> = {
  fetch: {
    title: 'Fetch',
    description: 'Downloads updated references from the remote repository without changing your working files.',
    command: 'git fetch'
  },
  pull: {
    title: 'Pull',
    description: 'Downloads remote commits and integrates them into your current branch.',
    command: 'git pull'
  },
  push: {
    title: 'Push',
    description: 'Uploads your local commits to the remote repository.',
    command: 'git push'
  },
  publish: {
    title: 'Publish Branch',
    description: 'Connects your local branch to a branch on the remote named origin.',
    command: 'git push -u origin <branch>'
  },
  commit: {
    title: 'Commit',
    description: 'Saves the staged changes in the repository history with a message.',
    command: 'git commit -m "<message>"'
  },
  amend: {
    title: 'Amend Previous Commit',
    description: 'Updates the previous commit to include the currently staged changes.',
    command: 'git commit --amend'
  },
  stage: {
    title: 'Stage',
    description: 'Marks a file to be included in the next commit.',
    command: 'git add <file>'
  },
  unstage: {
    title: 'Unstage',
    description: 'Removes a file from the staging area without discarding changes.',
    command: 'git restore --staged <file>'
  },
  discard: {
    title: 'Discard Changes',
    description: 'Reverts a file to the state in the last commit. This cannot be undone.',
    command: 'git restore <file>'
  },
  createBranch: {
    title: 'Create Branch',
    description: 'Creates a new branch starting from the current commit.',
    command: 'git branch <name>'
  },
  checkoutBranch: {
    title: 'Checkout Branch',
    description: 'Switches the working tree to another branch.',
    command: 'git checkout <branch>'
  },
  deleteBranch: {
    title: 'Delete Branch',
    description: 'Removes a local branch reference. Commits that exist only on this branch may become difficult to recover.',
    command: 'git branch -d <branch>'
  },
  stash: {
    title: 'Create Stash',
    description: 'Temporarily saves your working changes so you can switch tasks.',
    command: 'git stash push -m "<message>"'
  },
  stashApply: {
    title: 'Apply Stash',
    description: 'Restores the stash changes but keeps the stash saved.',
    command: 'git stash apply stash@{<n>}'
  },
  stashPop: {
    title: 'Pop Stash',
    description: 'Restores the stash changes and removes the stash if successful.',
    command: 'git stash pop stash@{<n>}'
  },
  stashDelete: {
    title: 'Delete Stash',
    description: 'Deletes the stash without applying it.',
    command: 'git stash drop stash@{<n>}'
  }
};

export function explain(operation: string): GitOperationExplanation | undefined {
  return gitExplanations[operation];
}
