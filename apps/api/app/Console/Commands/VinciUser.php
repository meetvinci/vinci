<?php

namespace App\Console\Commands;

use App\Accounts\Accounts;
use Illuminate\Console\Command;
use InvalidArgumentException;
use Symfony\Component\Console\Output\OutputInterface;

class VinciUser extends Command
{
    protected $signature = 'vinci:user {email} {--name= : The name shown for this person} {--new : Only create: an existing account keeps its password and nothing is printed}';

    protected $description = 'Create a login account, or give an existing one a new password, and print the password once';

    public function handle(Accounts $accounts): int
    {
        try {
            $result = $accounts->ensure($this->argument('email'), $this->option('name'));

            if (! $result['created'] && $this->option('new')) {
                return self::SUCCESS;
            }

            $password = $result['password'] ?? $accounts->resetPassword($accounts->find($this->argument('email')));
        } catch (InvalidArgumentException $error) {
            $this->output->getErrorStyle()->writeln($error->getMessage(), OutputInterface::VERBOSITY_QUIET);

            return self::FAILURE;
        }

        // With --quiet, only the password and a newline, for scripts such as cloud-init.
        if ($this->option('quiet')) {
            $this->output->writeln($password, OutputInterface::VERBOSITY_QUIET | OutputInterface::OUTPUT_RAW);

            return self::SUCCESS;
        }

        $this->line(($result['created'] ? 'Created' : 'New password for').' '.Accounts::normalize($this->argument('email')).'.');
        $this->line("Password: {$password}");

        return self::SUCCESS;
    }
}
