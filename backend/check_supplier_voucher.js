const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSupplierVoucherUpdate() {
  try {
    console.log('Checking voucher update: 5219cb6a5f1836d051bd71c49ff0414ea081b020\n');
    
    // Find the specific voucher
    const voucher = await prisma.voucher.findUnique({
      where: { 
        id: '5219cb6a5f1836d051bd71c49ff0414ea081b020' 
      },
      include: {
        VoucherEntry: {
          include: {
            Account: {
              include: {
                Subgroup: {
                  include: {
                    MainGroup: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!voucher) {
      console.log('❌ Voucher not found with this ID');
      return;
    }

    console.log('✅ Voucher Found:');
    console.log(`   - Voucher Number: ${voucher.voucherNumber}`);
    console.log(`   - Type: ${voucher.type}`);
    console.log(`   - Status: ${voucher.status}`);
    console.log(`   - Date: ${voucher.date}`);
    console.log(`   - Total Debit: Rs. ${voucher.totalDebit?.toLocaleString() || 0}`);
    console.log(`   - Total Credit: Rs. ${voucher.totalCredit?.toLocaleString() || 0}`);
    console.log(`   - Created: ${voucher.createdAt}`);
    console.log(`   - Updated: ${voucher.updatedAt}`);

    if (voucher.VoucherEntry && voucher.VoucherEntry.length > 0) {
      console.log('\n📝 Voucher Entries:');
      voucher.VoucherEntry.forEach((entry, index) => {
        console.log(`\n   Entry ${index + 1}:`);
        console.log(`   - Account: ${entry.Account.code} - ${entry.Account.name}`);
        console.log(`   - Account Type: ${entry.Account.Subgroup.MainGroup.type}`);
        console.log(`   - Account Subgroup: ${entry.Account.Subgroup.code} - ${entry.Account.Subgroup.name}`);
        console.log(`   - Current Balance: Rs. ${entry.Account.currentBalance?.toLocaleString() || 0}`);
        console.log(`   - Debit: Rs. ${entry.debit?.toLocaleString() || 0}`);
        console.log(`   - Credit: Rs. ${entry.credit?.toLocaleString() || 0}`);
        console.log(`   - Description: ${entry.description || 'No description'}`);
        
        // Check if this is a supplier account
        const isSupplierAccount = entry.Account.supplierId ? true : false;
        console.log(`   - Is Supplier Account: ${isSupplierAccount ? 'YES' : 'NO'}`);
        
        if (isSupplierAccount) {
          console.log(`   - Supplier ID: ${entry.Account.supplierId}`);
        }
      });
    }

    // Check all supplier accounts to see if any were affected
    console.log('\n\n🏢 CHECKING ALL SUPPLIER ACCOUNTS:');
    const supplierAccounts = await prisma.account.findMany({
      where: {
        supplierId: {
          not: null
        }
      },
      include: {
        Supplier: {
          select: {
            name: true
          }
        },
        Subgroup: {
          include: {
            MainGroup: true
          }
        }
      }
    });

    console.log(`Found ${supplierAccounts.length} supplier accounts:\n`);
    
    supplierAccounts.forEach((account, index) => {
      console.log(`${index + 1}. ${account.code} - ${account.name}`);
      console.log(`   - Supplier: ${account.Supplier?.name || 'Unknown'}`);
      console.log(`   - Account Type: ${account.Subgroup.MainGroup.type}`);
      console.log(`   - Current Balance: Rs. ${account.currentBalance?.toLocaleString() || 0}`);
      console.log(`   - Status: ${account.status}`);
      console.log(`   - Updated: ${account.updatedAt}`);
    });

    // Check recent vouchers that might affect supplier accounts
    console.log('\n\n📋 RECENT VOUCHERS AFFECTING SUPPLIER ACCOUNTS:');
    const recentVouchers = await prisma.voucher.findMany({
      take: 10,
      orderBy: { updatedAt: 'desc' },
      include: {
        VoucherEntry: {
          include: {
            Account: {
              include: {
                Supplier: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });

    let supplierVouchers = recentVouchers.filter(voucher => 
      voucher.VoucherEntry.some(entry => entry.Account.supplierId)
    );

    console.log(`Found ${supplierVouchers.length} recent vouchers affecting supplier accounts:\n`);
    
    supplierVouchers.forEach((voucher, index) => {
      console.log(`${index + 1}. ${voucher.voucherNumber} - ${voucher.type} - ${voucher.status}`);
      console.log(`   - Date: ${voucher.date}`);
      console.log(`   - Updated: ${voucher.updatedAt}`);
      
      const supplierEntries = voucher.VoucherEntry.filter(entry => entry.Account.supplierId);
      supplierEntries.forEach(entry => {
        console.log(`   - Supplier Account: ${entry.Account.code} - ${entry.Account.Supplier?.name}`);
        console.log(`   - Debit: Rs. ${entry.debit?.toLocaleString() || 0}`);
        console.log(`   - Credit: Rs. ${entry.credit?.toLocaleString() || 0}`);
      });
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSupplierVoucherUpdate();
