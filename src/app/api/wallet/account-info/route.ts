import { NextRequest, NextResponse } from 'next/server';

const CELESTIA_REST = 'https://api-mocha.pops.one';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Address parameter is required' },
        { status: 400 }
      );
    }

    console.log('🔍 Fetching account info for:', address);

    // Fetch account info from Celestia REST API
    const response = await fetch(`${CELESTIA_REST}/cosmos/auth/v1beta1/accounts/${address}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ REST API Error:', error);
      return NextResponse.json(
        {
          error: `Failed to fetch account info: ${error}`
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    if (!result.account) {
      console.error('❌ No account in response:', result);
      return NextResponse.json(
        {
          error: 'Account not found in response'
        },
        { status: 404 }
      );
    }

    const account = result.account;

    console.log('✅ Account info retrieved:', {
      address: account.address,
      account_number: account.account_number,
      sequence: account.sequence
    });

    return NextResponse.json({
      address: account.address,
      account_number: account.account_number,
      sequence: account.sequence,
      pub_key: account.pub_key
    });

  } catch (error: any) {
    console.error('Account info API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch account info' },
      { status: 500 }
    );
  }
}
