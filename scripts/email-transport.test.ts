import test from 'node:test';
import assert from 'node:assert/strict';
import {emailTransport} from '../src/lib/email-transport';
test('sign-in uses the configured accounts key and sender when the generic key is empty',()=>{
 assert.deepEqual(emailTransport('accounts',{RESEND_API_KEY:'',RESEND_API_KEY_ACCOUNTS:'accounts-test-key',MAIL_FROM_ACCOUNTS:'Accounts <accounts@example.test>',EMAIL_FROM:'fallback@example.test'}),{apiKey:'accounts-test-key',from:'Accounts <accounts@example.test>'});
});
test('account, receipt and staff messages use their own credentials',()=>{
 const env={RESEND_API_KEY_ACCOUNTS:'account-test-key',RESEND_API_KEY_ORDERS:'order-test-key',RESEND_API_KEY_NOTIFICATIONS:'notice-test-key'};
 assert.equal(emailTransport('accounts',env).apiKey,'account-test-key');assert.equal(emailTransport('orders',env).apiKey,'order-test-key');assert.equal(emailTransport('notifications',env).apiKey,'notice-test-key');
});
test('existing single-key deployments retain generic fallbacks',()=>{
 assert.deepEqual(emailTransport('accounts',{RESEND_API_KEY:'shared-test-key',EMAIL_FROM:'shared@example.test'}),{apiKey:'shared-test-key',from:'shared@example.test'});
 assert.deepEqual(emailTransport('accounts',{}),{apiKey:'',from:''});
});
