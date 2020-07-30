const nock = require('nock');
var zlib = require('zlib');

const chai = require('chai');
const chaiSubset = require('chai-subset');

const SqlRestore = require('./index');

chai.use(chaiSubset);

const { expect } = chai;

const sourceProjectId = 'dummy-source-project';
const sourceInstanceId = 'dummy-source-instance';
// const sourceProjectId = 'houston-production-au';
// const sourceInstanceId = 'houston-production-au';
const targetProjectId = 'dummy-target-project';
const targetInstanceId = 'dummy-target-instance';

const backupList = [
	{
		id: '1',
		startTime: '2020-07-27T14:35:27.206Z',
	},
	{
		// Most recent
		id: '2',
		startTime: '2020-07-28T14:35:27.206Z',
	},
	{
		id: '3',
		startTime: '2020-07-26T14:35:27.206Z',
	},
];

describe('CloudSQLRestore', () => {
	let restoreHelper;
	before(() => {
		restoreHelper = new SqlRestore();
		restoreHelper.authorizeJwt('./test-service-account.json');
		// restoreHelper.authorizeJwt('./houston-production-au-017c68c16d66.json');
	});

	describe('listBackups', () => {
		let backups;
		before(async () => {
			nockList(sourceProjectId, sourceInstanceId);
			backups = await restoreHelper.listBackups({
				projectId: sourceProjectId,
				instanceId: sourceInstanceId,
			});
		});
		it('Retreieves backups', () => {
			expect(backups).to.containSubset(backupList);
		});
	});

	describe('restoreBackup', () => {
		let nockResult;
		before(async () => {
			nockResult = nockRestore(targetProjectId, targetInstanceId);
			await restoreHelper.restoreBackup({
				sourceProjectId,
				sourceInstanceId,
				targetProjectId,
				targetInstanceId,
				backupRunId: '1',
			});
		});
		it('restores specified backup', () => {
			expect(nockResult.body).to.deep.eq({
				restoreBackupContext: {
					backupRunId: '1',
					project: sourceProjectId,
					instanceId: sourceInstanceId,
				}
			});
		});
	});
	describe('restoreLatestBackup', () => {
		let nockResult;
		before(async () => {
			nockList(sourceProjectId, sourceInstanceId);
			nockResult = nockRestore(targetProjectId, targetInstanceId);
			await restoreHelper.restoreLatestBackup({
				sourceProjectId,
				sourceInstanceId,
				targetProjectId,
				targetInstanceId,
			});
		});
		it('restores the latest backup', () => {
			expect(nockResult.body).to.deep.eq({
				restoreBackupContext: {
					backupRunId: backupList[1].id,
					project: sourceProjectId,
					instanceId: sourceInstanceId,
				},
			});
		});
	});
});

function nockGoogle() {
	return nock('https://www.googleapis.com');
}

function nockRestore(targetProjectId, targetInstanceId) {
	nockJwt();
	const result = {};
	nockGoogle()
		.post(`/sql/v1beta4/projects/${targetProjectId}/instances/${targetInstanceId}/restoreBackup`)
		.reply((uri, requestBody) => {
			result.body = requestBody;
			return [200, {}];
		});
	return result;
}

function nockList(projectId, instanceId) {
	nockJwt();
	nockGoogle()
		.get(
			`/sql/v1beta4/projects/${projectId}/instances/${instanceId}/backupRuns`
		)
		.reply(200,
			{
				items: backupList,
			},
		);
}

function nockJwt() {
	nockGoogle()
		.post('/oauth2/v4/token')
		.reply(200, {
			"access_token": "XXXX.c.XXXXXXXX_",
			"expires_in": 3599,
			"token_type": "Bearer"
		});
}
