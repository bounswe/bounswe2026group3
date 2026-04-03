import { Redirect } from 'expo-router';
import { isLoggedIn } from '../src/services/auth';

export default function Index() {
  return <Redirect href={isLoggedIn() ? '/tabs' : '/auth/login'} />;
}
