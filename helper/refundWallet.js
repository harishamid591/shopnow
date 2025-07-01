const Wallet = require('../models/walletSchema');
const Transaction = require('../models/transactionSchema');
const Order = require('../models/orderSchema'); // required to fetch order and items

const creditWallet = async ({
  userId,
  amount,
  orderId,
  productId,
  purpose = 'refund',
  description = 'Refund issued',
}) => {
  if (!userId || !amount || !orderId || !productId) throw new Error('Missing required parameters');

  // Fetch the order to calculate the correct refund
  const order = await Order.findOne({ orderId });
  if (!order) throw new Error('Order not found');

  // Find the specific product/item in the order
  const item = order.orderedItems.find((i) => i._id.toString() === productId);

  if (!item) throw new Error('Product not found in order');

  let refundAmount = amount;

  // Handle coupon discount adjustment (proportional logic)
  if (order.couponApplied && order.discount > 0) {
    const itemTotal = item.price * item.quantity;

    // Total amount of all items in order (before discount)
    const totalOrderAmount = order.orderedItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

    // Proportion of discount for this item
    const discountRatio = itemTotal / totalOrderAmount;
    const proportionalDiscount = order.discount * discountRatio;

    refundAmount = itemTotal - proportionalDiscount;
  }

  // Round to 2 decimals (optional for currency handling)
  refundAmount = Math.round(refundAmount * 100) / 100;

  // Credit the wallet
  let wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    // Create a new wallet with first refund
    wallet = await Wallet.create({
      userId,
      balance: refundAmount,
      refundAmount: refundAmount,
      transactions: [
        {
          amount: refundAmount,
          transactionType: 'credit',
          transactionPurpose: 'refund',
          description,
        },
      ],
    });
  } else {
    wallet.balance += refundAmount;
    wallet.refundAmount += refundAmount;
    wallet.transactions.push({
      amount: refundAmount,
      transactionType: 'credit',
      transactionPurpose: 'refund',
      description,
    });
    await wallet.save();
  }

  // Record a Transaction
  await Transaction.create({
    userId,
    amount: refundAmount,
    transactionType: 'credit',
    paymentMethod: 'refund',
    paymentGateway: 'none',
    purpose, // e.g. 'return', 'cancellation'
    description,
    orders: [{ orderId, amount: refundAmount }],
    walletBalanceAfter: wallet.balance,
    metadata: { productId },
  });
};

module.exports = { creditWallet };
