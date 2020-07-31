const nock = require('nock');
var zlib = require('zlib');

const chai = require('chai');
const chaiSubset = require('chai-subset');

const SqlRestore = require('./index');

chai.use(chaiSubset);

const { expect } = chai;

const sourceProjectId = 'dummy-source-project';
const sourceInstanceId = 'dummy-source-instance';
const targetProjectId = 'dummy-target-project';
const targetInstanceId = 'dummy-target-instance';

const backupList = [
	{
		id: '1',
		startTime: '2020-07-27T14:35:27.206Z',
		status: 'SUCCESSFUL',
	},
	{
		// Most recent
		id: '2',
		startTime: '2020-07-28T14:35:27.206Z',
		status: 'SUCCESSFUL',
	},
	{
		id: '3',
		startTime: '2020-07-26T14:35:27.206Z',
		status: 'SUCCESSFUL',
	},
	{
		// Most recent, but failed
		id: '4',
		startTime: '2020-07-29T14:35:27.206Z',
		status: 'FAILED',
	},
];

const errorMessage = 'Something bad happened, your backup was not restored';

const operationInProgress = {
	kind: 'restore',
	status: 'RUNNING',
	error: null,
	operationType: 'RESTORE_VOLUME',
	selfLink: `https://www.googleapis.com/sql/v1beta4/projects/${targetProjectId}/operations/1234`,
	targetProject: targetProjectId,
};

const operationSuccess = {
	...operationInProgress,
	status: 'DONE',
};

const operationFailed = {
	...operationSuccess,
	status: 'DONE',
	error: [{
		"kind": 'sql#operationErrors',
		"errors": [{
			"kind": 'bad',
			"code": 'bad-thing',
			"message": errorMessage,
		}],
	}],
};

describe('CloudSQLRestore', () => {
	let restoreHelper;
	let nockResult;
	let restoreOperation;

	before(() => {
		restoreHelper = new SqlRestore();
		restoreHelper.authorizeJwt('./test-service-account.json');
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
		before(async () => {
			nockResult = nockRestore(targetProjectId, targetInstanceId);
			restoreOperation = await restoreHelper.restoreBackup({
				sourceProjectId,
				sourceInstanceId,
				targetProjectId,
				targetInstanceId,
				backupRunId: '1',
			});
		});
		itStartsRestore('1');
	});
	describe('restoreLatestBackup', () => {
		before(async () => {
			nockList(sourceProjectId, sourceInstanceId);
			nockResult = nockRestore(targetProjectId, targetInstanceId);
			restoreOperation = await restoreHelper.restoreLatestBackup({
				sourceProjectId,
				sourceInstanceId,
				targetProjectId,
				targetInstanceId,
			});
		});
		itStartsRestore(backupList[1].id);
	});

	describe('listOperations', () => {
		before(async () => {
			nockListOperations(targetProjectId, targetInstanceId);
			restoreOperation = await restoreHelper.listOperations({
				projectId: targetProjectId,
				instanceId: targetInstanceId,
			});
		});
		it('lists operations', () => {
			expect(restoreOperation).to.deep.eq([
				operationSuccess,
				operationInProgress,
				operationFailed,
			]);
		});
	});

	describe('checkOperationStatus', () => {
		describe('WHEN operation is complete', () => {
			before(async () => {
				nockOperation(targetProjectId, operationSuccess);
				restoreOperation = await restoreHelper.checkOperationStatus(operationInProgress);
			});
			itReturnsOperation(operationSuccess);
		})
		describe('WHEN operation has error', () => {
			before(() => {
				nockOperation(targetProjectId, operationFailed);
			});
			it('throws error', async () => {
				let error;
				try {
					await restoreHelper.checkOperationStatus(operationInProgress);
				} catch (e) {
					console.error(e);
					error = e;
				}
				expect(error.message).to.eq(errorMessage);
			});
		});
	});

	function itStartsRestore(backupRunId) {
		it('restores specified backup', () => {
			expect(nockResult.body).to.deep.eq({
				restoreBackupContext: {
					backupRunId,
					project: sourceProjectId,
					instanceId: sourceInstanceId,
				},
			});
		});
		itReturnsOperation(operationInProgress);
	}
	function itReturnsOperation(op) {
		it('returns operation', () => {
			expect(restoreOperation).to.deep.eq(op);
		});
	}
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
			return [200, operationInProgress];
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

function nockOperation(targetProjectId, returnOperation) {
	nockJwt();
	nockGoogle()
		.get(
			`/sql/v1beta4/projects/${targetProjectId}/operations/1234`
		)
		.reply(200, returnOperation);
}

function nockListOperations(projectId, instanceId) {
	nockJwt();
	nockGoogle()
		.get(
			`/sql/v1beta4/projects/${projectId}/operations?maxResults=10&instance=${instanceId}`
		)
		.reply(200, { items: [operationSuccess, operationInProgress, operationFailed] });
}
