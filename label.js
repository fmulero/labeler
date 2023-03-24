const github = require("@actions/github");
const core = require("@actions/core");
const util = require("util");

var labelsToAdd = core
  .getInput("add-labels")
  .split(",")
  .map(x => x.trim());

var labelsToRemove = core
  .getInput("remove-labels")
  .split(",")
  .map(x => x.trim());

/**
 * Obtain the issue number either from input or from the context
 * @param core - the core object
 * @param context - the context object
 * @returns {*|number} - issue/card/pr number if not provided by user.
 */
function getIssueNumber(core, context) {
  let issueNumber = core.getInput("issue-number");

  // return what is provided
  if (issueNumber) return issueNumber;

  // return the one found in issue
  issueNumber = context.payload.issue && context.payload.issue.number;
  if (issueNumber) return issueNumber;

  // return the one found in PR
  issueNumber =
    context.payload.pull_request && context.payload.pull_request.number;
  if (issueNumber) return issueNumber;

  let card_url =
    context.payload.project_card && context.payload.project_card.content_url;
  issueNumber = card_url && card_url.split("/").pop();

  return issueNumber;
}

async function label() {
  const myToken = core.getInput("repo-token");
  const ignoreIfAssigned = core.getInput("ignore-if-assigned");
  const ignoreIfLabeled = core.getInput("ignore-if-labeled");
  const octokit = new github.getOctokit(myToken);
  const context = github.context;
  const repoName = context.payload.repository.name;
  const ownerName = context.payload.repository.owner.login;
  const issueNumber = getIssueNumber(core, context);

  if (issueNumber === undefined) {
    return "No action being taken. Ignoring because issueNumber was not identified";
  } else {
    labelsToAdd = labelsToAdd.filter(value => ![""].includes(value));

    labelsToRemove = labelsToRemove.filter(value => ![""].includes(value));

    if (ignoreIfAssigned || ignoreIfLabeled || labelsToRemove.length !== 0) {
      // query for the most recent information about the issue. Between the issue being created and
      // the action running, labels or asignees could have been added
      try {
        var updatedIssueInformation = await octokit.rest.issues.get({
          owner: ownerName,
          repo: repoName,
          issue_number: issueNumber
        });
      } catch (err) {
        throw new Error(
          `Can not get information for issue number ${issueNumber} in ${ownerName}/${repoName} repository. Cause: ${err}`,
          { cause: err }
        );
      }
      if (ignoreIfAssigned) {
        // check if the issue has been assigned to anyone
        if (updatedIssueInformation.data.assignees.length !== 0) {
          return "No action being taken. Ignoring because one or more assignees have been added to the issue";
        }
      }
      let labels = updatedIssueInformation.data.labels.map(label => label.name);
      if (ignoreIfLabeled) {
        if (labels.length !== 0) {
          return "No action being taken. Ignoring because one or labels have been added to the issue";
        }
      }
      for (let labelToAdd of labelsToAdd) {
        if (!labels.includes(labelToAdd)) {
          labels.push(labelToAdd);
        }
      }
      labels = labels.filter(value => !labelsToRemove.includes(value));
      try {
        await octokit.rest.issues.update({
          owner: ownerName,
          repo: repoName,
          issue_number: issueNumber,
          labels: labels
        });
      } catch (err) {
        throw new Error(
          `Can not update issue number ${issueNumber} in ${ownerName}/${repoName} repository. Cause: ${err}`,
          { cause: err }
        );
      }
      return `Updated labels in ${issueNumber}. Added: ${labelsToAdd}. Removed: ${labelsToRemove}.`;
    } else {
      // The action is trying to add new labels. If an empty array is passed as parameter, all labels will be deleted.
      // https://docs.github.com/en/rest/issues/labels?apiVersion=2022-11-28#add-labels-to-an-issue
      try {
        await octokit.rest.issues.addLabels({
          owner: ownerName,
          repo: repoName,
          issue_number: issueNumber,
          labels: labelsToAdd
        });
      } catch (err) {
        throw new Error(
          `Can not add labels to the issue number ${issueNumber} in ${ownerName}/${repoName} repository. Cause: ${err}`,
          { cause: err }
        );
      }
      return `Updated labels in ${issueNumber}. Added: ${labelsToAdd}.`;
    }
  }
}

label()
  .then(
    result => {
      core.info(result);
    },
    err => {
      core.debug(util.inspect(err));
      core.setFailed(err);
    }
  )
  .catch(err => {
    core.debug(util.inspect(err));
    core.setFailed(err);
  });
