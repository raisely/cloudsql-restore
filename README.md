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
