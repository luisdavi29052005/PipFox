
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.resolve(process.cwd(), 'backend/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function setupPlans() {
  try {
    console.log('Setting up plans...');

    // Delete existing plans
    await supabase.from('plans').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert new plans matching the database schema
    const plans = [
      {
        name: 'Free',
        price: 0.00,
        currency: 'usd',
        limits: {
          workflows: 3,
          facebook_accounts: 2,
          posts_per_day: 100,
          stripe_price_id: 'price_1Ru4xzGjO63cg6b9ZWBb9BFY',
          stripe_product_id: 'prod_SpkSkzNmnrPd6k'
        }
      },
      {
        name: 'Pro',
        price: 39.00,
        currency: 'usd',
        limits: {
          workflows: 15,
          facebook_accounts: 10,
          posts_per_day: 1000,
          stripe_price_id: 'price_1Ru50RGjO63cg6b9WTQigiYL',
          stripe_product_id: 'prod_SpkV0qXN8Okhb7'
        }
      },
      {
        name: 'Enterprise',
        price: 199.00,
        currency: 'usd',
        limits: {
          workflows: -1,
          facebook_accounts: 50,
          posts_per_day: -1,
          stripe_price_id: 'price_1Ru51VGjO63cg6b9w6GIGEUm',
          stripe_product_id: 'prod_SpkWnuRh9ngVWY'
        }
      }
    ];

    const { data, error } = await supabase
      .from('plans')
      .insert(plans)
      .select();

    if (error) {
      console.error('Error inserting plans:', error);
      throw error;
    }

    console.log('Plans setup completed successfully:');
    console.log(data);

  } catch (error) {
    console.error('Setup failed:', error);
    throw error;
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupPlans().catch(() => process.exit(1));
}
