# Usage

```js
const SqlRestore = require('cloudsql-restore');

restoreHelper = new SqlRestore();
restoreHelper.authorizeJwt('./test-service-account.json');

backups = await restoreHelper.listBackups({
	projectId: sourceProjectId,
	instanceId: sourceInstanceId,
});

await restoreHelper.restoreBackup({
	sourceProjectId,
	sourceInstanceId,
	targetProjectId,
	targetInstanceId,
	// An id of a run returned by listBackups
	backupRunId,
});

// Restores the most recent backup
await restoreHelper.restoreLatestBackup({
	sourceProjectId,
	sourceInstanceId,
	targetProjectId,
	targetInstanceId,
});
```

Here's an example of the output returned by listBackups

```js
[{
	kind: 'sql#backupRun',
	status: 'SUCCESSFUL',
	enqueuedTime: '2020-07-24T14:52:14.591Z',
	id: '1595599200001',
	startTime: '2020-07-24T14:52:14.750Z',
	endTime: '2020-07-24T14:54:20.016Z',
	type: 'AUTOMATED',
	windowStartTime: '2020-07-24T14:00:00Z',
	instance: 'demo-instance',
	selfLink:
	'https://www.googleapis.com/sql/v1beta4/projects/demo-project/instances/demo-instance/backupRuns/1595599200001',
	location: 'asia',
	backupKind: 'SNAPSHOT'
}]
```

# Service Account & Roles

To limit the scope of the service account, you may want to create custom roles so you can grant reading of backups
to the source project and restoring of backups to the target project.

You should [review the permissions](https://cloud.google.com/sql/docs/postgres/project-access-control) needed to backup/restore instances.

Here's the permissions we've found work for backing up/restoring:

For your source project to list and access the backups:
```
cloudsql.instances.get
cloudsql.instances.list
cloudsql.backupRuns.list
cloudsql.backupRuns.get
```

For your target project to restore a backup to it
```
cloudsql.instances.get
cloudsql.instances.list
cloudsql.instances.restoreBackup
```

# License

Licensed under the [NoHarm license](./LICENSE.md)
