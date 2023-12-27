// Syncs Auth0 user with Stripe customer record
exports.onExecutePostLogin = async (event, api) => {
  try{
    const stripe = require('stripe')(event.secrets.STRIPE_SECRET);

    //If user already has stripe_customer_id in Auth0
    if(event.user.app_metadata.stripe_customer_id) {
      await verifyStripeSubscription(api, stripe, event.user.app_metadata.stripe_customer_id);
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

async function verifyStripeSubscription(api, stripe, customerId) {
  // TODO: verify the Stripe subscription status
  setClaims(api, customerId);
}

async function createStripeCustomer(api, stripe, user) {
  const customer = await stripe.customers.create({
    name: `${user.given_name} ${user.family_name}`,
    email: user.email,
    description: "Created by Auth0",
    metadata: { auth0_user_id: user.user_id }
  });

  // TODO: create a Stripe subscription, update metadata, and set claims
  updateMetadata(api, customer.id);
  setClaims(api, customer.id);
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
  
  // TODO: verify the Stripe subscription status, update metadata, and set claims
  updateMetadata(api, customerId);
  setClaims(api, customerId);
}

function updateMetadata(api, customerId) {
  api.user.setAppMetadata("stripe_customer_id", customerId);
  // TODO: update Stripe subscription in app metadata
}

function setClaims(api, customerId) {
  api.idToken.setCustomClaim("stripe_customer_id",customerId);
  // TODO: send Stripe subscription to application
}