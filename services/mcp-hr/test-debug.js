const { deleteEmployee } = require('./dist/tools/delete-employee');

const mockHrWriteUser = {
  userId: 'hr-user-123',
  username: 'alice.chen',
  roles: ['hr-write'],
};

const input = { employeeId: 'emp-001' };

deleteEmployee(input, mockHrWriteUser).then(result => {
  console.log('Result:', JSON.stringify(result, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
