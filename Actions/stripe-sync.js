/**
 * In this action, we use stripe to manage subscriptions with a free and a premium sku.
 * Replace this variable with your own values
 * If you don't have subscriptions in Stripe, look at stripe-sync-no-subs.js
 */
const FREE_PLAN = "";
const PREMIUM_PLAN = "";

/**
* Syncs Auth0 user with Stripe customer and subscription
*
* @param {Event} event - Details about the user and the context in which they are logging in.
* @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
*/
exports.onExecutePostLogin = async (event, api) => {
  try{
    const stripe = require('stripe')(event.secrets.STRIPE_SECRET);
    

    //If user already has stripe_customer_id in Auth0 metadata, search latest subscription status using the stripe customer id
    if(event.user.app_metadata.stripe_customer_id) {
        api.idToken.setCustomClaim(`stripe_customer_id`,event.user.app_metadata.stripe_customer_id);

        const subscriptions = await stripe.subscriptions.list({
            customer: event.user.app_metadata.stripe_customer_id
        });

        if(subscriptions.data.length == 1){
            const subscription = subscriptions.data[0];
            const plan = (subscription.plan.id == PREMIUM_PLAN) ? "premium" : "free";

            // If the subscription type or status changed, update Auth0's metadata
            if(subscription.status !== event.user.app_metadata.stripe_plan_status || 
               subscription.plan.id !== event.user.app_metadata.stripe_plan_id ||
               plan !== event.user.app_metadata.stripe_plan){
                api.user.setAppMetadata("stripe_subscription_id", subscription.id);
                api.user.setAppMetadata("stripe_plan_id", subscription.plan.id);
                api.user.setAppMetadata("stripe_plan", plan);
                api.user.setAppMetadata("stripe_plan_status", subscription.status);
            }

            api.idToken.setCustomClaim(`stripe_plan`, plan);
            api.idToken.setCustomClaim(`stripe_plan_status`, subscription.status);
        }
        return;
    }

    // Check if a customer exists in stripe
    const customers = await stripe.customers.list({email: event.user.email});
    switch(customers.data.length){
      // 0: Create customer entry in Stripe
      case 0:
        const customer = await stripe.customers.create({
          name: `${event.user.given_name} ${event.user.family_name}`,
          email: event.user.email,
          description: "Created by Auth0",
          metadata: { auth0_user_id: event.user.user_id }
        });

        // Add user to free plan
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: FREE_PLAN }],
        });

        api.user.setAppMetadata("stripe_customer_id", customer.id);
        api.user.setAppMetadata("stripe_subscription_id", subscription.id);
        api.user.setAppMetadata("stripe_plan_id", FREE_PLAN);
        api.user.setAppMetadata("stripe_plan", "free");
        api.user.setAppMetadata("stripe_plan_status", subscription.status);

        api.idToken.setCustomClaim("stripe_customer_id", customer.id);
        api.idToken.setCustomClaim(`stripe_plan`, 'free');
        api.idToken.setCustomClaim(`stripe_plan_status`, subscription.status);

        break;
      //1: Sync record
      case 1:
        await stripe.customers.update(
          customers.data[0].id,
          {
            description: "Updated by Auth0",
            name: `${event.user.given_name} ${event.user.family_name}`,
            metadata: { auth0_user_id: event.user.user_id },
          }
        );
        api.user.setAppMetadata("stripe_customer_id", customers.data[0].id);
        api.idToken.setCustomClaim(`stripe_customer_id`,customers.data[0].id);

        const subscriptions = await stripe.subscriptions.list({
          customer: customers.data[0].id,
        });

        if(subscriptions.data.length == 1){
          const subscription = subscriptions.data[0];
          const plan = (subscription.plan.id == PREMIUM_PLAN) ? "premium" : "free";
          api.user.setAppMetadata("stripe_subscription_id", subscription.id);
          api.user.setAppMetadata("stripe_plan_id", subscription.plan.id);
          api.user.setAppMetadata("stripe_plan", plan);
          api.user.setAppMetadata("stripe_plan_status", subscription.status);
          api.idToken.setCustomClaim(`stripe_plan`, plan);
          api.idToken.setCustomClaim(`stripe_plan_status`, subscription.status);
        }
        break;
      //>1: throw an error
      default:
        throw Error(`More than one user (${customers.data.length}) in Stripe with the email ${event.user.email}.`);
    }
  }catch(e){
    console.error(e.message);
  }
};
