const FREE_PLAN = "";
const PREMIUM_PLAN = "";

// Syncs Auth0 user with Stripe customer record
exports.onExecutePostLogin = async (event, api) => {
  try{
    const stripe = require('stripe')(event.secrets.STRIPE_SECRET);

    //If user already has stripe_customer_id in Auth0, check the subscription status
    if(event.user.app_metadata.stripe_customer_id) {
      await verifyStripeSubscription(event, api, stripe, event.user.app_metadata.stripe_customer_id);
      return;
    }
    
    // Check if a customer exists in stripe
    const customers = await stripe.customers.list({email: event.user.email});
    switch(customers.data.length){
      // 0: Create customer entry in Stripe
      case 0:
        await createStripeCustomer(api, stripe, event.user);
        break;
      //1: Sync record
      case 1:
        await updateStripeCustomer(api, stripe, customers.data[0].id, event.user);
        break;
      //>1: throw an error
      default:
        throw Error(`More than one user (${customers.data.length}) in Stripe with the email ${event.user.email}.`);
    }
  }catch(e){
    console.error(e.message);
  }
};

async function verifyStripeSubscription(event, api, stripe, customerId) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
  });

  if(subscriptions.data.length == 1){
    const subscription = subscriptions.data[0];
    if(subscription.status !== event.user.app_metadata.stripe_plan_status || 
       subscription.plan.id !== event.user.app_metadata.stripe_plan_id){
        updateMetadata(api, customerId, subscription);
    }
    setClaims(api, customerId, subscription);
  }
}

async function createStripeCustomer(api, stripe, user) {
  const customer = await stripe.customers.create({
    name: `${user.given_name} ${user.family_name}`,
    email: user.email,
    description: "Created by Auth0",
    metadata: { auth0_user_id: user.user_id }
  });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: FREE_PLAN }],
  });

  updateMetadata(api, customer.id, subscription);
  setClaims(api, customer.id, subscription);
}

async function updateStripeCustomer(api, stripe, customerId, user) {
  await stripe.customers.update(
    customerId,
    {
      description: "Updated by Auth0",
      name: `${user.given_name} ${user.family_name}`,
      metadata: { auth0_user_id: user.user_id },
    }
  );
  
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
  });

  updateMetadata(api, customerId, subscriptions.data[0]);
  setClaims(api, customerId, subscriptions.data[0]);
}

function updateMetadata(api, customerId, subscription) {
  api.user.setAppMetadata("stripe_customer_id", customerId);
  if(subscription){
    const plan = (subscription.plan.id === PREMIUM_PLAN) ? "premium" : "free";
    api.user.setAppMetadata("stripe_subscription_id", subscription.id);
    api.user.setAppMetadata("stripe_plan_id", subscription.plan.id);
    api.user.setAppMetadata("stripe_plan", plan);
    api.user.setAppMetadata("stripe_plan_status", subscription.status);
  }
}

function setClaims(api, customerId, subscription) {
  api.idToken.setCustomClaim("stripe_customer_id",customerId);
  if(subscription){
    const plan = (subscription.plan.id === PREMIUM_PLAN) ? "premium" : "free";
    api.idToken.setCustomClaim("stripe_plan", plan);
    api.idToken.setCustomClaim("stripe_plan_status", subscription.status);
  }
}