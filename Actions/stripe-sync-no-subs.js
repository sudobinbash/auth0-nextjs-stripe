/**
* Syncs Auth0 user with Stripe customer record (for a version with subscriptions, check stripe-sync.js)
*
* @param {Event} event - Details about the user and the context in which they are logging in.
* @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
*/
exports.onExecutePostLogin = async (event, api) => {
  try{
    const stripe = require('stripe')(event.secrets.STRIPE_SECRET);

    //If user already has stripe_customer_id in Auth0, skip the query
    if(event.user.app_metadata.stripe_customer_id) {
      api.idToken.setCustomClaim("stripe_customer_id", event.user.app_metadata.stripe_customer_id);
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
        api.user.setAppMetadata("stripe_customer_id", customer.id);
        api.idToken.setCustomClaim("stripe_customer_id", customer.id);
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

        break;
      //>1: throw an error
      default:
        throw Error(`More than one user (${customers.data.length}) in Stripe with the email ${event.user.email}.`);
    }
  }catch(e){
    console.error(e.message);
  }
};
